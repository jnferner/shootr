#![allow(unknown_lints)]

#[macro_use]
extern crate serde_derive;
#[macro_use]
extern crate derive_more;
#[macro_use]
extern crate shootr_derive;
#[macro_use]
extern crate maplit;

#[macro_use]
pub mod util;
pub mod model;

pub mod system;
pub mod bootstrap;
