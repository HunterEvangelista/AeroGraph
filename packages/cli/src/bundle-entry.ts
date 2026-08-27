// The bundled CLI deliberately uses msgpackr's portable implementation. The
// optional native addon is not part of the tarball and must not be resolved
// from the build machine's checkout.
process.env["MSGPACKR_NATIVE_ACCELERATION_DISABLED"] = "true";
await import("./cli");

export {};
