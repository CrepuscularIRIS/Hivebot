// F4 owns spawning/relaunch. Main is currently a client of an externally started SDK.
export async function restartSdk(): Promise<{ ok: false; error: { code: string; message: string } }> {
  return { ok: false, error: { code: 'pbots/unavailable', message: 'SDK restart is unavailable: this main process does not own the SDK.' } }
}
