use std::ptr::{addr_of_mut, null_mut};

use quick_error::{quick_error};

use super::bw_vector::{bw_vector_push};
use super::scr;
use super::{BwScr};

const EMPTY_SUB_COMMANDS: scr::DrawSubCommands = scr::DrawSubCommands {
    unk: 0,
    first: null_mut(),
};

quick_error! {
    #[derive(Debug)]
    pub enum DrawError {
        OutOfDrawCommands {
            display("Ran out of draw commands")
        }
    }
}

struct RenderTarget {
    bw: *mut scr::RenderTarget,
    id: u32,
}

struct VertexBufferAlloc<T> {
    data: *mut T,
    byte_offset: usize,
    length: usize,
}

impl<T: Copy> VertexBufferAlloc<T> {
    fn set(&self, index: usize, value: T) {
        assert!(index < self.length);
        unsafe {
            *self.data.add(index) = value;
        }
    }
}

pub unsafe fn add_overlays(
    commands: *mut scr::DrawCommands,
    vertex_buf: *mut scr::VertexBuffer,
    bw: &BwScr,
) {
    // Render target 1 should be for UI..
    let render_target = RenderTarget {
        bw: (bw.get_render_target)(1),
        id: 1,
    };
    for i in 0x0..=0xe {
        let layer = 0x10 + i;
        let x_base = 0.1 + 0.2 * (i & 3) as f32;
        let y_base = 0.1 + 0.2 * (i >> 2) as f32;
        let coords = [
            (x_base + 0.1, y_base + 0.05),
            (x_base + 0.02, y_base + 0.18),
            (x_base + 0.18, y_base + 0.18),
        ];
        if let Err(e) = triangle(layer, &coords, commands, vertex_buf, &render_target) {
            error!("Failed to draw triangle: {e}");
        }
    }
}

unsafe fn triangle(
    layer: u16,
    coords: &[(f32, f32); 3],
    commands: *mut scr::DrawCommands,
    vertex_buf: *mut scr::VertexBuffer,
    render_target: &RenderTarget,
) -> Result<(), DrawError> {
    // BW requires (or seems to require) to have quad in DrawCommand,
    // but at the same time it is also working with triangles in that 4 vertices
    // is hardcoded to require 6 indices.
    // Going to just use 3 vertices and 3 indices and leave the remaining indices all
    // point to same vertex so that nothing should get drawn there.
    let vertices = allocate_vertices(vertex_buf, 0x2, 0x4);
    let indices = allocate_indices(vertex_buf, 0x6);
    for (i, xy) in coords.iter().enumerate() {
        vertices.set(i * 2 + 0, xy.0);
        vertices.set(i * 2 + 1, xy.1);
    }
    for (i, &index) in [0u16, 1, 2, 0, 0, 0].iter().enumerate() {
        indices.set(i, index);
    }
    let draw_command = new_draw_command(commands, layer).ok_or(DrawError::OutOfDrawCommands)?;
    *draw_command = scr::DrawCommand {
        render_target_id: render_target.id,
        is_hd: 0,
        texture_ids: [0; 7],
        // Indexed quad
        draw_mode: 1,
        // flat_color_frag
        shader_id: 2,
        vertex_buffer_offset_bytes: vertices.byte_offset,
        index_buffer_offset_bytes: indices.byte_offset,
        allocated_vertex_count: 4,
        used_vertex_count: 4,
        _unk3c: 0xffff,
        blend_mode: 0,
        subcommands_pre: EMPTY_SUB_COMMANDS,
        subcommands_post: EMPTY_SUB_COMMANDS,
        shader_constants: [0.0f32; 0x14],
    };
    // Set solidColor
    (*draw_command).shader_constants[0x4] = 1.0;
    (*draw_command).shader_constants[0x5] = 0.5;
    (*draw_command).shader_constants[0x6] = 0.5;
    (*draw_command).shader_constants[0x7] = 1.0;
    set_render_target_wh_recip(draw_command, render_target);
    Ok(())
}

unsafe fn set_render_target_wh_recip(
    command: *mut scr::DrawCommand,
    render_target: &RenderTarget,
) {
    let width_recip = 1.0f32 / (*render_target.bw).width as f32;
    let height_recip = 1.0f32 / (*render_target.bw).height as f32;
    (*command).shader_constants[0xe] = width_recip;
    (*command).shader_constants[0xf] = height_recip;
}

unsafe fn new_draw_command(
    commands: *mut scr::DrawCommands,
    layer: u16,
) -> Option<*mut scr::DrawCommand> {
    let index = (*commands).draw_command_count as usize;
    if index >= (*commands).commands.len() {
        return None;
    }
    (*commands).draw_command_count = index as u16 + 1;
    let command = (*commands).commands.as_mut_ptr().add(index);
    let draw_sort = addr_of_mut!((*commands).draw_sort_vector) as *mut scr::BwVector;
    let draw_sort_index = (*draw_sort).length as u16;
    bw_vector_push(draw_sort, scr::DrawSort {
        layer,
        index: draw_sort_index,
        command,
    });

    Some(command)
}

unsafe fn allocate_vertices(
    vertex_buf: *mut scr::VertexBuffer,
    floats_per_vertex: u32,
    vertex_count: u32,
) -> VertexBufferAlloc<f32> {
    let float_count = (vertex_count * floats_per_vertex) as usize;
    // BW makes alignment multiple of vertex byte size (floats_per_vertex * 4),
    // but it seems to be pointless? What would alignment of 0x14 help?
    // Going to just check that alignment is at 4 and not even trying to fix it
    // if not.
    let start_offset = (*vertex_buf).allocated_size_bytes;
    assert!(start_offset & 3 == 0, "Bad vertex alignment {:x}", start_offset);
    let end_offset = start_offset + float_count * 4;
    while end_offset > vertex_buf_capacity_bytes(vertex_buf) {
        vertex_buf_grow(vertex_buf);
    }
    (*vertex_buf).allocated_size_bytes = end_offset;
    let data = ((*vertex_buf).buffer.data as *mut u8).add(start_offset) as *mut f32;
    VertexBufferAlloc {
        data,
        byte_offset: start_offset,
        length: float_count,
    }
}

unsafe fn vertex_buf_capacity_bytes(vertex_buf: *mut scr::VertexBuffer) -> usize {
    (*vertex_buf).buffer_size_u32s * 4
}

#[cold]
unsafe fn vertex_buf_grow(vertex_buf: *mut scr::VertexBuffer) {
    todo!()
}

unsafe fn allocate_indices(
    vertex_buf: *mut scr::VertexBuffer,
    count: u32,
) -> VertexBufferAlloc<u16> {
    let start_offset = (*vertex_buf).index_buffer_allocated_bytes;
    assert!(start_offset & 1 == 0, "Bad index alignment {:x}", start_offset);
    let end_offset = start_offset + count as usize * 2;
    while end_offset > index_buf_capacity_bytes(vertex_buf) {
        index_buf_grow(vertex_buf);
    }
    (*vertex_buf).index_buffer_allocated_bytes = end_offset;
    let data = ((*vertex_buf).index_buffer.data as *mut u8).add(start_offset) as *mut u16;
    VertexBufferAlloc {
        data,
        byte_offset: start_offset,
        length: count as usize,
    }
}

unsafe fn index_buf_capacity_bytes(vertex_buf: *mut scr::VertexBuffer) -> usize {
    (*vertex_buf).index_buf_size_u16s * 2
}

#[cold]
unsafe fn index_buf_grow(vertex_buf: *mut scr::VertexBuffer) {
    todo!()
}
