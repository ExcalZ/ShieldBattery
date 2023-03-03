use std::mem;
use std::time::Instant;

use egui::{Align2, Event, PointerButton, Pos2, Rect, Vec2};
use winapi::shared::windef::{HWND};

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

impl OverlayState {
    pub fn new() -> OverlayState {
        OverlayState {
            ctx: egui::Context::default(),
            start_time: Instant::now(),
            ui_rects: Vec::new(),
            events: Vec::new(),
            captured_mouse_down: [false; 2],
            window_size: (100, 100),
            screen_size: (100, 100),
            mouse_debug: (0, 0, Pos2 { x: 0.0, y: 0.0}),
        }
    }

    pub fn step(&mut self, screen_size: (u32, u32)) -> StepOutput {
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
            let res = egui::Window::new("test window")
                .anchor(Align2::RIGHT_TOP, Vec2::ZERO)
                .show(ctx, |ui| {
                    ui.label("Test test");
                    ui.label("More test");
                    ui.label("More test 1");
                    ui.label("More test 2");
                    ui.label("More test 3");
                    ui.label("More test 4");
                    ui.label("More test 5555555555555555555");
                    ui.label(egui::RichText::new("Size 30 text").size(30.0));
                });
            self.add_ui_rect(&res);
            let res = egui::Window::new("Debug")
                .anchor(Align2::LEFT_TOP, Vec2::ZERO)
                .show(ctx, |ui| {
                    ctx.settings_ui(ui);
                    let msg = format!("Windows mouse {}, {}, egui {}, {}",
                        self.mouse_debug.0,
                        self.mouse_debug.1,
                        self.mouse_debug.2.x,
                        self.mouse_debug.2.y,
                    );
                    ui.label(egui::RichText::new(msg).size(22.0));
                    let msg = format!("Windows size {}, {}, egui size {}, {}",
                        self.window_size.0,
                        self.window_size.1,
                        self.screen_size.0,
                        self.screen_size.1,
                    );
                    ui.label(egui::RichText::new(msg).size(22.0));
                });
            self.add_ui_rect(&res);
        });
        StepOutput {
            textures_delta: output.textures_delta,
            primitives: self.ctx.tessellate(output.shapes),
        }
    }

    fn add_ui_rect<T>(&mut self, response: &Option<egui::InnerResponse<T>>) {
        if let Some(res) = response {
            self.ui_rects.push(res.response.rect);
        }
    }

    /// If this returns Some(), the message won't be passed to BW
    pub unsafe fn window_proc(
        &mut self,
        _window: HWND,
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

fn current_egui_modifiers() -> egui::Modifiers {
    use winapi::um::winuser::*;

    unsafe {
        let alt_down = GetKeyState(VK_MENU) & 1 != 0;
        let ctrl_down = GetKeyState(VK_CONTROL) & 1 != 0;
        let shift_down = GetKeyState(VK_SHIFT) & 1 != 0;
        egui::Modifiers {
            alt: alt_down,
            ctrl: ctrl_down,
            shift: shift_down,
            mac_cmd: false,
            command: ctrl_down,
        }
    }
}
