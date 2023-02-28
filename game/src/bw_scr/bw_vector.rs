use std::mem;
use std::ptr;

use libc::c_void;

use super::scr;
use super::{bw_malloc, bw_free};

/// NOTE: Call only if `T` has no copy / move operators.
pub unsafe fn bw_vector_push<T>(vec: *mut scr::BwVector, value: T) {
    let length = (*vec).length;
    if length >= (*vec).capacity {
        let old_ptr = (*vec).data as *mut T;
        let new_cap = (*vec).capacity * 2;
        let new_ptr = bw_malloc(mem::size_of::<T>() * new_cap) as *mut T;
        ptr::copy_nonoverlapping(old_ptr, new_ptr, length);
        bw_free(old_ptr as *mut u8);
        (*vec).data = new_ptr as *mut c_void;
        (*vec).capacity = new_cap;
    }
    ((*vec).data as *mut T).add(length).write(value);
    (*vec).length = length + 1;
}
