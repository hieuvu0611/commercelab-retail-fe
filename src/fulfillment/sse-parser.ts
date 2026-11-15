export interface SseMessage {
  event: string
  data: string
}

/**
 * Server-sent events by hand: `EventSource` cannot send the Authorization header, so the stream is read with fetch and
 * its text is parsed here. Feed it chunks as they arrive; it returns the events completed by each chunk.
 */
export function createSseParser(): (chunk: string) => SseMessage[] {
  let buffer = ''
  return (chunk) => {
    let text = (buffer + chunk).replace(/\r\n/g, '\n')
    // A lone CR at the end may be the first half of a CRLF split across chunks.
    const tail = text.endsWith('\r') ? '\r' : ''
    if (tail) text = text.slice(0, -1)
    const blocks = text.replace(/\r/g, '\n').split('\n\n')
    buffer = (blocks.pop() ?? '') + tail

    const messages: SseMessage[] = []
    for (const block of blocks) {
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length > 0) messages.push({ event, data: data.join('\n') })
    }
    return messages
  }
}
