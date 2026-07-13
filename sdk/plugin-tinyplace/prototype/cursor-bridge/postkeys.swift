// Post Cmd+V then Return to a specific PID WITHOUT foregrounding it.
// Usage: postkeys <pid>   (clipboard is set by the caller via pbcopy)
// If Chromium accepts these background events into its focused chat field, this
// gives zero-focus-steal injection.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 2, let pid = Int32(args[1]) else {
  FileHandle.standardError.write("usage: postkeys <pid>\n".data(using: .utf8)!)
  exit(2)
}

let src = CGEventSource(stateID: .combinedSessionState)

func post(_ key: CGKeyCode, _ flags: CGEventFlags) {
  if let d = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: true) {
    d.flags = flags
    d.postToPid(pid)
  }
  if let u = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: false) {
    u.flags = flags
    u.postToPid(pid)
  }
}

post(9, .maskCommand) // Cmd+V (paste)
// Pass "paste" as arg 2 to skip the submit (leaves text in the box for testing).
if args.count < 3 || args[2] != "paste" {
  usleep(120_000)
  post(36, []) // Return (submit)
}
