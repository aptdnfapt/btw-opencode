import type { Plugin } from "@opencode-ai/plugin"
import { getForkedSession, setForkedSession, updateLastUsed, getAllTrackedSessions } from "./storage.js"

const BTW_COMMAND = "btw"

// Helper to show toast notification
function showToast(
  client: any,
  title: string,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
  duration = 5000,
) {
  if (!client?.tui?.showToast) return
  client.tui.showToast({
    body: { title, message, variant, duration },
  }).catch(() => {})
}

export const BTWPlugin: Plugin = async (ctx) => {
  const { client } = ctx

  // In-memory cache of tracked forked sessions for quick idle event checking
  let trackedForkedSessions: Set<string> = new Set()

  // Load tracked sessions on startup
  getAllTrackedSessions()
    .then((sessions) => {
      trackedForkedSessions = sessions
    })
    .catch((err) => {
      console.error("BTW: Failed to load tracked sessions", err)
    })

  return {
    // Register the /btw command dynamically
    config: async (input: any) => {
      if (!input.command) input.command = {}
      input.command[BTW_COMMAND] = {
        template: "$ARGUMENTS",
        description: "Fork session and run prompt in background",
      }
    },

    // Listen for session.idle events to notify when BTW tasks complete
    event: async (input: { event: any }) => {
      if (input.event?.type !== "session.idle") return

      const idleSessionID = input.event.properties?.sessionID
      if (!idleSessionID) return

      // Check if this is one of our tracked BTW forked sessions
      if (trackedForkedSessions.has(idleSessionID)) {
        showToast(client, "BTW Complete", "Background task finished. Run /session to see it.", "success", 8000)
      }
    },

    // Handle /btw command execution
    "command.execute.before": async (input: { command: string; sessionID: string; arguments: string }) => {
      if (input.command !== BTW_COMMAND) return

      const prompt = input.arguments?.trim()

      // Show usage if no prompt provided
      if (!prompt) {
        showToast(client, "BTW", "Usage: /btw <your prompt>", "warning", 5000)
        throw new Error("Command handled by btw plugin")
      }

      try {
        // Check if we already have a forked BTW session for this parent
        const existingMapping = await getForkedSession(input.sessionID)
        let forkedSessionID: string

        if (existingMapping) {
          // Reuse existing forked session
          forkedSessionID = existingMapping.forkedSessionID
          await updateLastUsed(input.sessionID)

          // Send prompt to existing forked session (fire and forget)
          ;(client as any).session
            .prompt({
              path: { id: forkedSessionID },
              body: {
                parts: [{ type: "text", text: prompt }],
              },
            })
            .catch((err: any) => {
              console.error("BTW: Failed to send prompt to existing forked session", err)
            })

          // Show confirmation toast
          showToast(client, "BTW", "Prompt sent to background session. Run /session to see it.", "info", 5000)
        } else {
          // First time - fork the session
          const forkResult = await (client as any).session.fork({
            path: { id: input.sessionID },
          })

          const forkedData = forkResult?.data || forkResult
          if (!forkedData?.id) {
            showToast(client, "BTW Error", "Failed to fork session", "error", 5000)
            throw new Error("Command handled by btw plugin")
          }

          forkedSessionID = forkedData.id

          // Track this forked session
          await setForkedSession(input.sessionID, forkedSessionID)
          trackedForkedSessions.add(forkedSessionID)

          // Update forked session title
          const titlePreview = prompt.slice(0, 50) + (prompt.length > 50 ? "..." : "")
          ;(client as any).session
            .update({
              path: { id: forkedSessionID },
              body: {
                title: `BTW: ${titlePreview}`,
              },
            })
            .catch((err: any) => {
              console.error("BTW: Failed to update session title", err)
            })

          // Send prompt to forked session (fire and forget)
          ;(client as any).session
            .prompt({
              path: { id: forkedSessionID },
              body: {
                parts: [{ type: "text", text: prompt }],
              },
            })
            .catch((err: any) => {
              console.error("BTW: Failed to send prompt to forked session", err)
            })

          // Show confirmation toast
          showToast(client, "BTW", "Session started. Run /session to see it.", "info", 5000)
        }

        throw new Error("Command handled by btw plugin")
      } catch (err) {
        // Re-throw if it's our "handled" marker
        if (err instanceof Error && err.message === "Command handled by btw plugin") {
          throw err
        }

        // Actual error - show to user
        console.error("BTW: Command failed", err)
        showToast(client, "BTW Error", err instanceof Error ? err.message : String(err), "error", 5000)
        throw new Error("Command handled by btw plugin")
      }
    },
  }
}

export default BTWPlugin
