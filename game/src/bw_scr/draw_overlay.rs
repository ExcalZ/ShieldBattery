use std::borrow::Cow;
use std::mem;
use std::sync::Arc;
use std::time::Instant;

use egui::{
    Align, Align2, Color32, Event, Layout, Key, PointerButton, Pos2, Rect, Response, Sense, Vec2,
    Widget,
};
use egui::style::{TextStyle};
use winapi::shared::windef::{HWND, POINT};

use bw_dat::Race;

use crate::bw;

pub struct OverlayState {
    ctx: egui::Context,
    start_time: Instant,
    ui_rects: Vec<Rect>,
    events: Vec<Event>,
    window_size: (u32, u32),
    /// If (and only if) a mouse button down event was captured,
    /// capture the up event as well.
    captured_mouse_down: [bool; 2],
    /// Size told to egui. Currently render target size which seems to
    /// be always for 1080x1920 window (Width depends on SD/HD though)
    screen_size: (u32, u32),
    mouse_debug: (i16, i16, Pos2),
}

pub struct StepOutput {
    pub textures_delta: egui::TexturesDelta,
    pub primitives: Vec<egui::ClippedPrimitive>,
}

/// Bw globals used by OverlayState::step
pub struct BwVars {
    pub is_replay_or_obs: bool,
    pub game: bw_dat::Game,
    pub players: *mut bw::Player,
    pub main_palette: *mut u8,
}

trait UiExt {
    fn add_fixed_width<W: Widget>(&mut self, widget: W, width: f32) -> Response;
}

impl UiExt for egui::Ui {
    fn add_fixed_width<W: Widget>(&mut self, widget: W, width: f32) -> Response {
        let child_rect = self.cursor();
        let mut child_ui = self.child_ui(child_rect, *self.layout());
        let mut clip_rect = child_ui.clip_rect();
        if clip_rect.width() < width {
            clip_rect.set_width(width);
            child_ui.set_clip_rect(clip_rect);
        }
        let response = child_ui.add(widget);
        let mut final_child_rect = child_ui.min_rect();
        final_child_rect.set_width(width);
        self.allocate_rect(final_child_rect, Sense::hover());
        // Didn't examine if the response from child_ui has to be tweaked a bit to be correct,
        // maybe should not just return anything until it is needed.
        response
    }
}

impl OverlayState {
    pub fn new() -> OverlayState {
        let ctx = egui::Context::default();
        let mut style_arc = ctx.style();
        let style = Arc::make_mut(&mut style_arc);
        // Increase default font sizes a bit.
        // 16.0 seems to give a size that roughly matches with the smallest text size BW uses.
        let text_styles = [
            (TextStyle::Small, 12.0),
            (TextStyle::Body, 16.0),
            (TextStyle::Button, 16.0),
            (TextStyle::Monospace, 16.0),
        ];
        for &(ref text_style, size) in &text_styles {
            if let Some(font) = style.text_styles.get_mut(text_style) {
                font.size = size;
            }
        }
        ctx.set_style(style_arc);
        OverlayState {
            ctx,
            start_time: Instant::now(),
            ui_rects: Vec::new(),
            events: Vec::new(),
            captured_mouse_down: [false; 2],
            window_size: (100, 100),
            screen_size: (100, 100),
            mouse_debug: (0, 0, Pos2 { x: 0.0, y: 0.0}),
        }
    }

    pub fn step(&mut self, bw: &BwVars, screen_size: (u32, u32)) -> StepOutput {
        self.screen_size = screen_size;
        let pixels_per_point = 1.0;
        let screen_rect = Rect {
            min: Pos2 { x: 0.0, y: 0.0 },
            max: Pos2 {
                x: screen_size.0 as f32 / pixels_per_point,
                y: screen_size.1 as f32 / pixels_per_point,
            },
        };
        let time = self.start_time.elapsed().as_secs_f64();
        let events = mem::replace(&mut self.events, Vec::new());
        let has_focus = true;
        let input = egui::RawInput {
            screen_rect: Some(screen_rect),
            pixels_per_point: Some(pixels_per_point),
            // BW doesn't guarantee texture larger than 2048 pixels working
            // (But it depends on user's system)
            max_texture_side: Some(2048),
            time: Some(time),
            predicted_dt: 1.0 / 60.0,
            modifiers: current_egui_modifiers(),
            events,
            hovered_files: Vec::new(),
            dropped_files: Vec::new(),
            has_focus,
        };
        self.ui_rects.clear();
        let ctx = self.ctx.clone();
        let output = ctx.run(input, |ctx| {
            let debug = true;
            if debug {
                let res = egui::Window::new("Debug")
                    .anchor(Align2::LEFT_TOP, Vec2::ZERO)
                    .show(ctx, |ui| {
                        egui::ScrollArea::vertical()
                            .max_height(screen_size.1 as f32 * 0.8)
                            .show(ui, |ui| {
                                ctx.settings_ui(ui);
                            });
                        let msg = format!("Windows mouse {}, {},\n    egui {}, {}",
                            self.mouse_debug.0,
                            self.mouse_debug.1,
                            self.mouse_debug.2.x,
                            self.mouse_debug.2.y,
                        );
                        ui.label(egui::RichText::new(msg).size(18.0));
                        let msg = format!("Windows size {}, {}, egui size {}, {}",
                            self.window_size.0,
                            self.window_size.1,
                            self.screen_size.0,
                            self.screen_size.1,
                        );
                        ui.label(egui::RichText::new(msg).size(18.0));
                        let modifiers = current_egui_modifiers();
                        let msg = format!("Ctrl {}, Alt {}, shift {}",
                            modifiers.ctrl,
                            modifiers.alt,
                            modifiers.shift,
                        );
                        ui.label(egui::RichText::new(msg).size(18.0));
                    });
                self.add_ui_rect(&res);
            }
            if bw.is_replay_or_obs {
                self.add_replay_ui(bw, ctx);
            }
        });
        StepOutput {
            textures_delta: output.textures_delta,
            primitives: self.ctx.tessellate(output.shapes),
        }
    }

    fn add_replay_ui(&mut self, bw: &BwVars, ctx: &egui::Context) {
        egui::Window::new("Replay_Resources")
            .anchor(Align2::RIGHT_TOP, Vec2 { x: -10.0, y: 10.0 })
            .movable(false)
            .resizable(false)
            .title_bar(false)
            .show(ctx, |ui| {
                // Teams are 1-based, not 100% sure if everybody is on team 1 or 0
                // when there are no teams though, so including 0 too.
                for team in 0..5 {
                    ui.label(format!("Team {team}"));
                    for player_id in 0..8 {
                        let info = unsafe {
                            let player = bw.players.add(player_id as usize);
                            if (*player).team != team {
                                continue;
                            }
                            // Show only human / computer player types
                            let is_active = matches!((*player).player_type, 1 | 2);
                            if !is_active {
                                continue;
                            }
                            player_resources_info(bw, player, player_id)
                        };
                        ui.add(&info);
                    }
                }
            });
    }

    fn add_ui_rect<T>(&mut self, response: &Option<egui::InnerResponse<T>>) {
        if let Some(res) = response {
            self.ui_rects.push(res.response.rect);
        }
    }

    /// If this returns Some(), the message won't be passed to BW
    pub unsafe fn window_proc(
        &mut self,
        window: HWND,
        msg: u32,
        wparam: usize,
        lparam: isize,
    ) -> Option<isize> {
        use winapi::um::winuser::*;
        match msg {
            WM_SIZE => {
                let w = lparam as i16;
                let h = (lparam >> 16) as i16;
                if let (Ok(w), Ok(h)) = (w.try_into(), h.try_into()) {
                    // If something causes the window size be 0, it's probably better
                    // to ignore it that potentially divide by 0 later on..
                    if w != 0 && h != 0 {
                        self.window_size = (w, h);
                    }
                }
                None
            }
            WM_MOUSEMOVE => {
                let x = lparam as i16;
                let y = (lparam >> 16) as i16;
                let pos = self.window_pos_to_egui(x as i32, y as i32);
                self.mouse_debug = (x, y, pos);
                self.events.push(Event::PointerMoved(pos));
                None
            }
            WM_LBUTTONDOWN | WM_LBUTTONUP | WM_RBUTTONDOWN | WM_RBUTTONUP => {
                let (button, button_idx) = match msg {
                    WM_LBUTTONUP | WM_LBUTTONDOWN => (PointerButton::Primary, 0),
                    WM_RBUTTONUP | WM_RBUTTONDOWN => (PointerButton::Secondary, 1),
                    _ => return None,
                };
                let pressed = matches!(msg, WM_LBUTTONDOWN | WM_RBUTTONDOWN);
                let x = lparam as i16;
                let y = (lparam >> 16) as i16;
                let pos = self.window_pos_to_egui(x as i32, y as i32);
                let handle = if pressed {
                    self.ui_rects.iter().any(|x| x.contains(pos))
                } else {
                    self.captured_mouse_down[button_idx]
                };
                if !handle {
                    return None;
                }
                self.captured_mouse_down[button_idx] = pressed;
                self.events.push(Event::PointerButton {
                    pos,
                    button,
                    pressed,
                    modifiers: egui::Modifiers {
                        alt: GetKeyState(VK_MENU) & 1 != 0,
                        ctrl: wparam & MK_CONTROL != 0,
                        shift: wparam & MK_SHIFT != 0,
                        mac_cmd: false,
                        command: wparam & MK_CONTROL != 0,
                    }
                });
                Some(0)
            }
            WM_MOUSEWHEEL => {
                let x = lparam as i16;
                let y = (lparam >> 16) as i16;
                let mut point = POINT {
                    x: x as i32,
                    y: y as i32,
                };
                ScreenToClient(window, &mut point);
                let pos = self.window_pos_to_egui(point.x, point.y);
                let handle = self.ui_rects.iter().any(|x| x.contains(pos));
                if !handle {
                    return None;
                }
                // Scroll amount seems to be fine without any extra scaling
                let amount = ((wparam >> 16) as i16) as f32;
                self.events.push(Event::Scroll(Vec2 { x: 0.0, y: amount }));
                Some(0)
            }
            WM_KEYDOWN | WM_KEYUP => {
                if !self.ctx.wants_keyboard_input() {
                    return None;
                }
                let vkey = wparam as i32;
                if let Some(key) = vkey_to_egui_key(vkey) {
                    let modifiers = current_egui_modifiers();
                    let pressed = msg == WM_KEYDOWN;
                    self.events.push(Event::Key {
                        key,
                        pressed,
                        // Could get repeat count from param, but egui docs say that
                        // it will be automatically done anyway by egui.
                        repeat: false,
                        modifiers,
                    });
                }
                Some(0)
            }
            WM_CHAR => {
                if !self.ctx.wants_keyboard_input() {
                    return None;
                }
                if wparam >= 0x80 {
                    // Too lazy to figure out how windows sends
                    // unicode chars to SC:R window, and we shouldn't need
                    // egui to support actual text input outside some
                    // debug stuff
                    return Some(0);
                }
                if let Some(c) = char::from_u32(wparam as u32) {
                    self.events.push(Event::Text(c.into()));
                }
                Some(0)
            }
            _ => None,
        }
    }

    fn window_pos_to_egui(&self, x: i32, y: i32) -> Pos2 {
        // If the draw surface is 4:3, but window is 16:9, assumes
        // that the draw surface be centered on the window.
        // (In that case screen_window_ratio will be 0.75)
        // BW shouldn't let the window be resized so that black bars are added to top/bottom
        // instead of left/right, but supporting that for completeness..
        //
        // Also idk if this should just ask BW where the draw surface is placed on
        // window instead of assuming centered.
        let window_w = self.window_size.0 as f32;
        let window_h = self.window_size.1 as f32;
        let screen_w = self.screen_size.0 as f32;
        let screen_h = self.screen_size.1 as f32;

        let screen_window_ratio = (screen_w / screen_h) / (window_w / window_h);
        if (screen_window_ratio - 1.0).abs() < 0.001 {
            Pos2 {
                x: x as f32 / window_w * screen_w,
                y: y as f32 / window_h * screen_h,
            }
        } else if screen_window_ratio < 1.0 {
            let x_offset = window_w * (1.0 - screen_window_ratio) * 0.5;
            let x_div = window_w * screen_window_ratio;
            Pos2 {
                x: (x as f32 - x_offset) / x_div * screen_w,
                y: y as f32 / window_h * screen_h,
            }
        } else {
            let ratio = screen_window_ratio.recip();
            let y_offset = window_h as f32 * (1.0 - ratio) * 0.5;
            let y_div = window_h * ratio;
            Pos2 {
                x: x as f32 / window_w * screen_w,
                y: (y as f32 - y_offset) / y_div * screen_h,
            }
        }
    }
}

struct PlayerInfo {
    name: Cow<'static, str>,
    color: Color32,
    race: u8,
    minerals: u32,
    gas: u32,
    supplies: [(u32, u32); 3],
    workers: u32,
}

impl Widget for &PlayerInfo {
    fn ui(self, ui: &mut egui::Ui) -> Response {
        let size = Vec2 { x: 300.0, y: 20.0 };
        ui.allocate_ui_with_layout(size, Layout::left_to_right(Align::Center), |ui| {
            let name = egui::Label::new(egui::RichText::new(&*self.name).color(self.color));
            ui.add_fixed_width(name, 140.0);
            let stat_text_width = 80.0;
            self.add_icon_text(ui, &self.minerals.to_string(), stat_text_width);
            self.add_icon_text(ui, &self.gas.to_string(), stat_text_width);
            self.add_icon_text(ui, &self.workers.to_string(), stat_text_width);
            let (current, max) = self.supplies.get(self.race as usize)
                .copied()
                .unwrap_or((0, 0));
            self.add_icon_text(ui, &format!("{} / {}", current, max), stat_text_width);
        }).response
    }
}

impl PlayerInfo {
    fn add_icon_text(&self, ui: &mut egui::Ui, text: &str, width: f32) {
        let label = egui::Label::new(text);
        ui.add_fixed_width(label, width);
    }
}

unsafe fn player_resources_info(
    bw: &BwVars,
    player: *mut bw::Player,
    player_id: u8,
) -> PlayerInfo {
    let game = bw.game;
    let get_supplies = |race| {
        let used = game.supply_used(player_id, race);
        let available = game.supply_provided(player_id, race)
            .min(game.supply_max(player_id, race));
        // Supply is internally twice the shown value (as zergling / scourge
        // takes 0.5 supply per unit), used supply has to be rounded up
        // when displayed.
        (used.wrapping_add(1) / 2, available / 2)
    };
    let color = bw::player_color(game, bw.main_palette, player_id);
    let supplies = [
        get_supplies(Race::Zerg),
        get_supplies(Race::Terran),
        get_supplies(Race::Protoss),
    ];
    let workers = [bw_dat::unit::SCV, bw_dat::unit::PROBE, bw_dat::unit::DRONE]
        .iter()
        .map(|&unit| game.completed_count(player_id, unit))
        .sum::<u32>();
    let mut name = bw::player_name(player);
    if name.is_empty() {
        name = format!("Player {}", player_id + 1).into();
    }
    let mut race = (*player).race;
    if race > 2 {
        race = 0;
    }
    PlayerInfo {
        name,
        color: Color32::from_rgb(color[0], color[1], color[2]),
        race,
        minerals: game.minerals(player_id),
        gas: game.gas(player_id),
        supplies,
        workers,
    }
}

fn current_egui_modifiers() -> egui::Modifiers {
    use winapi::um::winuser::*;

    unsafe {
        let alt_down = GetKeyState(VK_MENU) as u16 & 0x8000 != 0;
        let ctrl_down = GetKeyState(VK_CONTROL) as u16 & 0x8000 != 0;
        let shift_down = GetKeyState(VK_SHIFT) as u16 & 0x8000 != 0;
        egui::Modifiers {
            alt: alt_down,
            ctrl: ctrl_down,
            shift: shift_down,
            mac_cmd: false,
            command: ctrl_down,
        }
    }
}

fn vkey_to_egui_key(key: i32) -> Option<Key> {
    use egui::Key::*;
    use winapi::um::winuser::*;

    Some(match key {
        VK_DOWN => ArrowDown,
        VK_LEFT => ArrowLeft,
        VK_RIGHT => ArrowRight,
        VK_UP => ArrowUp,
        VK_ESCAPE => Escape,
        VK_TAB => Tab,
        VK_BACK => Backspace,
        VK_RETURN => Enter,
        VK_SPACE => Space,
        VK_INSERT => Insert,
        VK_DELETE => Delete,
        VK_HOME => Home,
        VK_END => End,
        VK_PRIOR => PageUp,
        VK_NEXT => PageDown,
        VK_SUBTRACT => Minus,
        VK_ADD => PlusEquals,
        0x30 | VK_NUMPAD0 => Num0,
        0x31 | VK_NUMPAD1 => Num1,
        0x32 | VK_NUMPAD2 => Num2,
        0x33 | VK_NUMPAD3 => Num3,
        0x34 | VK_NUMPAD4 => Num4,
        0x35 | VK_NUMPAD5 => Num5,
        0x36 | VK_NUMPAD6 => Num6,
        0x37 | VK_NUMPAD7 => Num7,
        0x38 | VK_NUMPAD8 => Num8,
        0x39 | VK_NUMPAD9 => Num9,
        0x41 => A,
        0x42 => B,
        0x43 => C,
        0x44 => D,
        0x45 => E,
        0x46 => F,
        0x47 => G,
        0x48 => H,
        0x49 => I,
        0x4a => J,
        0x4b => K,
        0x4c => L,
        0x4d => M,
        0x4e => N,
        0x4f => O,
        0x50 => P,
        0x51 => Q,
        0x52 => R,
        0x53 => S,
        0x54 => T,
        0x55 => U,
        0x56 => V,
        0x57 => W,
        0x58 => X,
        0x59 => Y,
        0x5a => Z,
        VK_F1 => F1,
        VK_F2 => F2,
        VK_F3 => F3,
        VK_F4 => F4,
        VK_F5 => F5,
        VK_F6 => F6,
        VK_F7 => F7,
        VK_F8 => F8,
        VK_F9 => F9,
        VK_F10 => F10,
        VK_F11 => F11,
        VK_F12 => F12,
        VK_F13 => F13,
        VK_F14 => F14,
        VK_F15 => F15,
        VK_F16 => F16,
        VK_F17 => F17,
        VK_F18 => F18,
        VK_F19 => F19,
        VK_F20 => F20,
        _ => return None,
    })
}
