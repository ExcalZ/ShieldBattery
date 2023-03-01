use std::ptr::{self, addr_of_mut, null_mut};

use bytemuck::{Pod, Zeroable};
use egui::{TexturesDelta, TextureId};
use egui::epaint;
use egui::epaint::textures::{TextureFilter};
use hashbrown::HashMap;
use quick_error::{quick_error};

use super::bw_vector::{bw_vector_push, bw_vector_reserve};
use super::draw_overlay;
use super::scr;
use super::{BwScr};

macro_rules! warn_once {
    ($($tokens:tt)*) => {{
        // This is probably spammy if it ever happens, warning only once
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| warn!($($tokens)*));
    }}
}

/// State persisted across draws
pub struct RenderState {
    textures: HashMap<TextureId, OwnedBwTexture>,
    temp_buffer: Vec<u8>,
}

/// Most of this isn't probably safe to use outside renderer (main) thread,
/// but will have to implement this anyway to have it be storable
/// in global BwScr.
unsafe impl Send for RenderState {}
unsafe impl Sync for RenderState {}

impl RenderState {
    pub fn new() -> RenderState {
        RenderState {
            textures: HashMap::with_capacity(16),
            temp_buffer: Vec::new(),
        }
    }
}

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

pub struct RenderTarget {
    pub bw: *mut scr::RenderTarget,
    pub id: u32,
    pub w_recip: f32,
    pub h_recip: f32,
}

impl RenderTarget {
    pub unsafe fn new(bw: *mut scr::RenderTarget, id: u32) -> RenderTarget {
        RenderTarget {
            bw,
            id,
            w_recip: 1.0 / (*bw).width as f32,
            h_recip: 1.0 / (*bw).height as f32,
        }
    }
}

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct ColoredVertex {
    pos: [f32; 2],
    texture: [f32; 2],
    color: u32,
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

    fn set_all(&self, value: &[T]) {
        assert!(value.len() <= self.length);
        unsafe {
            ptr::copy_nonoverlapping(value.as_ptr(), self.data, value.len());
        }
    }
}

fn egui_vertex_to_colored_vertex(
    render_target: &RenderTarget,
    vertex: &epaint::Vertex,
) -> ColoredVertex {
    ColoredVertex {
        // egui vertex position is in 0.0 .. screen_points range with origin in top left,
        // while BW wants the vertex in 0.0 .. 1.0 range with origin in bottom left
        pos: [vertex.pos.x * render_target.w_recip, 1.0 - vertex.pos.y * render_target.h_recip],
        texture: [vertex.uv.x, vertex.uv.y],
        color: u32::from_le_bytes(vertex.color.to_array()),
    }
}

pub unsafe fn add_overlays(
    state: &mut RenderState,
    renderer: *mut scr::Renderer,
    commands: *mut scr::DrawCommands,
    vertex_buf: *mut scr::VertexBuffer,
    overlay_out: &draw_overlay::StepOutput,
    render_target: &RenderTarget,
    bw: &BwScr,
) {
    update_textures(renderer, state, &overlay_out.textures_delta);
    let layer = 0x17;
    let mut triangles_drawn = 0u32;
    for primitive in &overlay_out.primitives {
        // Primitive also has clip rect, how to translate it to BW DrawCommand?
        match primitive.primitive {
            epaint::Primitive::Mesh(ref mesh) => {
                // Doing one DrawCommand per triangle for now..
                // Inefficient and worth trying to change sooner than later,
                // but not trying figure out what BW expects from it right now.
                if let Some(texture) = state.textures.get(&mesh.texture_id) {
                    for indices in mesh.indices.chunks_exact(3) {
                        let vertex1 = &mesh.vertices[indices[0] as usize];
                        let vertex2 = &mesh.vertices[indices[1] as usize];
                        let vertex3 = &mesh.vertices[indices[2] as usize];
                        let vertices = [
                            egui_vertex_to_colored_vertex(render_target, vertex1),
                            egui_vertex_to_colored_vertex(render_target, vertex2),
                            egui_vertex_to_colored_vertex(render_target, vertex3),
                        ];
                        if let Err(e) = triangle(
                            layer,
                            texture.bw(),
                            &vertices,
                            commands,
                            vertex_buf,
                            render_target,
                        ) {
                            warn_once!("Failed to draw triangle: {e}");
                        }
                        triangles_drawn += 1;
                    }
                } else {
                    warn_once!("Texture {:?} not found", mesh.texture_id);
                }
            }
            epaint::Primitive::Callback(..) => {
                // Probably not going to get created without ui code explicitly
                // asking for PaintCallback?
                warn_once!("Unimplemented paint callback");
            }
        }
    }
    debug!("Added {triangles_drawn} egui triangles, render target size {}x{}", (*render_target.bw).width, (*render_target.bw).height);
    free_textures(state, &overlay_out.textures_delta);
}

unsafe fn triangle(
    layer: u16,
    texture: *mut scr::RendererTexture,
    in_vertices: &[ColoredVertex; 3],
    commands: *mut scr::DrawCommands,
    vertex_buf: *mut scr::VertexBuffer,
    render_target: &RenderTarget,
) -> Result<(), DrawError> {
    // BW requires (or seems to require) to have quad in DrawCommand,
    // but at the same time it is also working with triangles in that 4 vertices
    // is hardcoded to require 6 indices.
    // Going to just use 3 vertices and 3 indices and leave the remaining indices all
    // point to same vertex so that nothing should get drawn there.
    let vertices = allocate_vertices(vertex_buf, 0x8, 0x4);
    let indices = allocate_indices(vertex_buf, 0x6);
    vertices.set_all(bytemuck::cast_slice(in_vertices));
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
        // colored_frag
        shader_id: 4,
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
    (*draw_command).texture_ids[0] = texture as usize;
    // Set multiplyColor
    (*draw_command).shader_constants[0x0] = 1.0;
    (*draw_command).shader_constants[0x1] = 1.0;
    (*draw_command).shader_constants[0x2] = 1.0;
    (*draw_command).shader_constants[0x3] = 1.0;
    set_render_target_wh_recip(draw_command, render_target);
    Ok(())
}

unsafe fn set_render_target_wh_recip(
    command: *mut scr::DrawCommand,
    render_target: &RenderTarget,
) {
    (*command).shader_constants[0xe] = render_target.w_recip;
    (*command).shader_constants[0xf] = render_target.h_recip;
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
unsafe fn vertex_buf_grow(vertex_buf: *mut scr::VertexBuffer) {
    // You may think that this should check if heap_allocated was
    // 0 and not assume that there's a vector to be freed..
    // But it doesn't work like that for some reason
    // Maybe `heap_allocated` is wrong name? Maybe it should
    // be buffer_inited or something. Can probably also just always
    // assume it to be 1 anyway.
    let new_capacity = (*vertex_buf).buffer_size_u32s * 2;
    (*vertex_buf).buffer_size_u32s = new_capacity;
    (*vertex_buf).heap_allocated = 1;
    let vector = addr_of_mut!((*vertex_buf).buffer);
    bw_vector_reserve::<f32>(vector, new_capacity);
    (*vector).length = new_capacity;
}

#[cold]
unsafe fn index_buf_grow(vertex_buf: *mut scr::VertexBuffer) {
    let new_capacity = (*vertex_buf).index_buf_size_u16s * 2;
    (*vertex_buf).index_buf_size_u16s = new_capacity;
    (*vertex_buf).index_buf_heap_allocated = 1;
    let vector = addr_of_mut!((*vertex_buf).index_buffer);
    bw_vector_reserve::<u16>(vector, new_capacity);
    (*vector).length = new_capacity;
}

/// Releases texture on drop,
struct OwnedBwTexture {
    texture: *mut scr::RendererTexture,
    renderer: *mut scr::Renderer,
    filtering: u8,
    format: u8,
    wrap_mode: u8,
}

impl OwnedBwTexture {
    pub unsafe fn new_rgba(
        renderer: *mut scr::Renderer,
        size: (u32, u32),
        data: &[u8],
        bilinear: bool,
    ) -> Option<OwnedBwTexture> {
        // Format 0 = RGBA, 1 = BGRA, 2 = DXT1, 3 = DXT5, 4 = R (Single channel), 5 = RGBA16f
        let format = 0;
        let filtering = if bilinear { 1 } else { 0 };
        // Wrap 0 = clamp, 1 = repeat, 2 = mirrored repeat
        let wrap_mode = 0;
        if data.len() != 4 * (size.0 * size.1) as usize {
            return None;
        }
        let texture = (*(*renderer).vtable).create_texture.call8(
            renderer,
            format,
            data.as_ptr(),
            data.len(),
            size.0,
            size.1,
            filtering,
            wrap_mode,
        );
        if texture.is_null() {
            None
        } else {
            Some(OwnedBwTexture {
                texture,
                renderer,
                filtering: filtering as u8,
                format: format as u8,
                wrap_mode: wrap_mode as u8,
            })
        }
    }

    fn bw(&self) -> *mut scr::RendererTexture {
        self.texture
    }

    fn update(&self, data: &[u8], pos: (u32, u32), size: (u32, u32)) {
        unsafe {
            if data.len() != 4 * (size.0 * size.1) as usize {
                warn!("Invalid data passed to OwnedBwTexture::update");
                return;
            }
            update_texture(
                self.renderer,
                self.texture,
                data,
                size.0,
                pos,
                size,
                self.format as u32,
                self.filtering as u32,
                self.wrap_mode as u32,
            );
        }
    }
}

impl Drop for OwnedBwTexture {
    fn drop(&mut self) {
        unsafe {
            (*(*self.renderer).vtable).delete_texture.call2(self.renderer, self.texture);
        }
    }
}

unsafe fn update_texture(
    renderer: *mut scr::Renderer,
    texture: *mut scr::RendererTexture,
    data: &[u8],
    row_length: u32,
    pos: (u32, u32),
    size: (u32, u32),
    format: u32,
    filtering: u32,
    wrap_mode: u32,
) {
    (*(*renderer).vtable).update_texture.call11(
        renderer,
        texture,
        pos.0,
        pos.1,
        size.0,
        size.1,
        data.as_ptr(),
        row_length,
        format,
        filtering,
        wrap_mode,
    );
}

unsafe fn update_textures(
    renderer: *mut scr::Renderer,
    state: &mut RenderState,
    delta: &TexturesDelta,
) {
    for &(id, ref delta) in &delta.set {
        // Not really sure which is best way to handle this since BW will only
        // accept one filtering mode instead of min/mag split.
        let bilinear = delta.options.magnification == TextureFilter::Linear ||
            delta.options.minification == TextureFilter::Linear;
        let size = delta.image.size();
        let size = (size[0] as u32, size[1] as u32);
        let rgba = egui_image_data_to_rgba(&delta.image, &mut state.temp_buffer);
        if let Some(pos) = delta.pos {
            if let Some(texture) = state.textures.get(&id) {
                texture.update(rgba, (pos[0] as u32, pos[1] as u32), size);
            } else {
                warn_once!("Tried to update nonexistent texture {id:?}");
            }
        } else {
            if let Some(texture) = OwnedBwTexture::new_rgba(renderer, size, rgba, bilinear) {
                state.textures.insert(id, texture);
            } else {
                error!("Could not create texture of size {size:?}");
            }
        }
    }
}

fn egui_image_data_to_rgba<'a>(image: &'a epaint::ImageData, buffer: &'a mut Vec<u8>) -> &'a [u8] {
    match image {
        epaint::ImageData::Color(image) => {
            bytemuck::cast_slice(&image.pixels)
        }
        epaint::ImageData::Font(image) => {
            buffer.clear();
            buffer.reserve(image.pixels.len() * 4);
            for pixel in image.srgba_pixels(None) {
                buffer.extend_from_slice(bytemuck::bytes_of(&pixel));
            }
            &buffer[..]
        }
    }
}

fn free_textures(state: &mut RenderState, delta: &TexturesDelta) {
    for &id in &delta.free {
        state.textures.remove(&id);
    }
}
