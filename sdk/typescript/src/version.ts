// SDK_VERSION mirrors the package.json "version" field. Keep it in sync on
// release — it is reported in the X-Tinyplace-SDK request header so the backend
// can recognize first-party clients (and, during the x402 standardization
// migration, decide whether to include the legacy `payment` challenge field).
export const SDK_VERSION = "1.0.1";

// HEADER_SDK_CLIENT is the request header first-party SDKs send to identify
// themselves to the backend; SDK_CLIENT is its value for this TypeScript SDK.
export const HEADER_SDK_CLIENT = "X-Tinyplace-SDK";
export const SDK_CLIENT = `ts/${SDK_VERSION}`;
