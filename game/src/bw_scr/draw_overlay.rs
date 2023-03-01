use std::time::Instant;

use egui::{Align2, Pos2, Vec2};

pub struct OverlayState {
    ctx: egui::Context,
    start_time: Instant,
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
        }
    }

    pub fn step(&mut self, screen_size: (u32, u32)) -> StepOutput {
        let pixels_per_point = 1.0;
        let screen_rect = egui::Rect {
            min: Pos2 { x: 0.0, y: 0.0 },
            max: Pos2 {
                x: screen_size.0 as f32 / pixels_per_point,
                y: screen_size.1 as f32 / pixels_per_point,
            },
        };
        let time = self.start_time.elapsed().as_secs_f64();
        let events = Vec::new();
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
        let output = self.ctx.run(input, |ctx| {
            egui::Window::new("test window")
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
        });
        StepOutput {
            textures_delta: output.textures_delta,
            primitives: self.ctx.tessellate(output.shapes),
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
