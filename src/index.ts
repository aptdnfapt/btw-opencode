import type { Plugin } from "@opencode-ai/plugin"
import { getForkedSession, setForkedSession, updateLastUsed, getAllTrackedSessions } from "./storage.js"

const BTW_COMMAND = "btw"
const BTW_PREFIX = "#BTW "
const HANDLED_ERROR = "Command handled by btw plugin"

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
        // Try to get session title for better notification
        let titlePreview = "background task"
        try {
          const sessionResult = await (client as any).session.get({
            path: { id: idleSessionID },
          })
          const title = sessionResult?.data?.title || sessionResult?.title || ""
          if (title.startsWith(BTW_PREFIX)) {
            titlePreview = title.slice(BTW_PREFIX.length)
          } else if (title) {
            titlePreview = title
          }
          if (titlePreview.length > 25) {
            titlePreview = titlePreview.slice(0, 25) + "..."
          }
        } catch (err) {
          console.error("BTW: Failed to fetch session title for idle notification", err)
        }

        showToast(client, "BTW Complete", `${titlePreview} finished. Run /session to see it.`, "success", 8000)
      }
    },

    // Handle /btw command execution
    "command.execute.before": async (input: { command: string; sessionID: string; arguments: string }) => {
      if (input.command !== BTW_COMMAND) return

      const prompt = input.arguments?.trim()

      // Show usage if no prompt provided
      if (!prompt) {
        showToast(client, "BTW", "Usage: /btw <your prompt>", "warning", 5000)
        throw new Error(HANDLED_ERROR)
      }

      try {
        const isSessionNotFound = (err: any): boolean => {
          const status = err?.status ?? err?.response?.status ?? err?.data?.status
          const message = String(err?.message ?? "").toLowerCase()
          const dataMessage = String(err?.data?.message ?? "").toLowerCase()
          return status === 404 || message.includes("not found") || message.includes("notfound") || dataMessage.includes("not found")
        }

        // Get parent session title once so new/re-forked sessions inherit it
        const parentSessionResult = await (client as any).session.get({
          path: { id: input.sessionID },
        })
        const parentTitle = parentSessionResult?.data?.title || parentSessionResult?.title || "Untitled"
        const titlePreview = parentTitle.length > 20 ? parentTitle.slice(0, 20) + "..." : parentTitle

        const createForkedSession = async (): Promise<string> => {
          const forkResult = await (client as any).session.fork({
            path: { id: input.sessionID },
            throwOnError: true,
          })

          const forkedData = forkResult?.data || forkResult
          if (!forkedData?.id) {
            showToast(client, "BTW Error", "Failed to fork session", "error", 5000)
            throw new Error(HANDLED_ERROR)
          }

          const newForkedSessionID = forkedData.id
          await setForkedSession(input.sessionID, newForkedSessionID)
          trackedForkedSessions.add(newForkedSessionID)

          const newTitle = `${BTW_PREFIX}${parentTitle}`
          await (client as any).session
            .update({
              path: { id: newForkedSessionID },
              body: {
                title: newTitle,
              },
              throwOnError: true,
            })
            .catch((err: any) => {
              console.error("BTW: Failed to update session title", err)
            })

          return newForkedSessionID
        }

        const sendPromptAsync = async (targetSessionID: string) => {
          await (client as any).session.promptAsync({
            path: { id: targetSessionID },
            body: {
              parts: [{ type: "text", text: prompt }],
            },
            throwOnError: true,
          })
        }

        // Check if we already have a forked BTW session for this parent
        const existingMapping = await getForkedSession(input.sessionID)
        let forkedSessionID: string

        if (existingMapping) {
          // Reuse existing forked session if it still exists
          forkedSessionID = existingMapping.forkedSessionID
          try {
            await (client as any).session.get({
              path: { id: forkedSessionID },
              throwOnError: true,
            })
          } catch (err) {
            if (!isSessionNotFound(err)) {
              throw err
            }
            // Stored fork was deleted, silently create a new one
            forkedSessionID = await createForkedSession()
          }
          await updateLastUsed(input.sessionID)
        } else {
          // First time - fork the session
          forkedSessionID = await createForkedSession()
        }

        // Send prompt in background; if fork vanished, re-fork and retry once
        try {
          await sendPromptAsync(forkedSessionID)
        } catch (err) {
          if (!isSessionNotFound(err)) {
            throw err
          }
          forkedSessionID = await createForkedSession()
          await sendPromptAsync(forkedSessionID)
        }

        showToast(client, "BTW", `Forked session started: ${titlePreview}`, "info", 5000)

        throw new Error(HANDLED_ERROR)
      } catch (err) {
        // Re-throw if it's our "handled" marker
        if (err instanceof Error && err.message === HANDLED_ERROR) {
          throw err
        }

        // Actual error - show to user
        console.error("BTW: Command failed", err)
        showToast(client, "BTW Error", err instanceof Error ? err.message : String(err), "error", 5000)
        throw new Error(HANDLED_ERROR)
      }
    },
  }
}

export default BTWPlugin
