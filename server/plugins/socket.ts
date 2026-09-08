import { Server as Engine } from 'engine.io'
import { Server as IOServer } from 'socket.io'
import { defineEventHandler } from 'h3'
import { registerIo } from '../realtime/emitters'
import { registerSocketHandlers } from '../realtime/handlers'
import { createLogger } from '../utils/logger'
import { SOCKET_PATH } from '../../shared/constants/socket'

const log = createLogger('socket')

/**
 * Pasang Socket.IO ke dalam proses Nitro (§35).
 *
 * Engine.IO menangani transport HTTP long-polling lewat router Nitro, sedangkan
 * upgrade WebSocket dijembatani ke handler websocket milik Nitro (crossws).
 * Dengan begitu satu port melayani aplikasi sekaligus realtime.
 */
export default defineNitroPlugin((nitroApp) => {
  const engine = new Engine({ pingInterval: 25_000, pingTimeout: 20_000 })
  const io = new IOServer({ path: SOCKET_PATH, serveClient: false })

  io.bind(engine as never)
  registerSocketHandlers(io)
  registerIo(io)

  nitroApp.router.use(
    `${SOCKET_PATH}/`,
    defineEventHandler({
      handler(event) {
        engine.handleRequest(event.node.req as never, event.node.res as never)
        event._handled = true
      },
      websocket: {
        open(peer) {
          const internal = (peer as unknown as { _internal: { nodeReq: never, ws: never } })._internal
          const nodeReq = internal?.nodeReq as unknown as { socket: unknown } | undefined
          if (!nodeReq || !internal?.ws) {
            log.warn('upgrade websocket tanpa konteks node, mengandalkan fallback polling')
            return
          }
          // @ts-expect-error API internal engine.io
          engine.prepare(nodeReq)
          // @ts-expect-error API internal engine.io
          engine.onWebSocket(nodeReq, nodeReq.socket, internal.ws)
        },
      },
    }),
  )

  nitroApp.hooks.hook('close', async () => {
    await io.close()
  })

  log.info('socket.io siap', { path: SOCKET_PATH })
})
