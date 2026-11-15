import { createSseParser } from '../sse-parser'

describe('createSseParser', () => {
  it('reads named events with their data', () => {
    const parse = createSseParser()
    expect(parse('event: stop_requested\ndata: {"orderId":"O-1"}\n\n')).toEqual([
      { event: 'stop_requested', data: '{"orderId":"O-1"}' },
    ])
  })

  it('joins several data lines and defaults the event name to message', () => {
    const parse = createSseParser()
    expect(parse('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('keeps a partial event until the rest arrives, also when a line is cut in half', () => {
    const parse = createSseParser()
    expect(parse('event: stop_req')).toEqual([])
    expect(parse('uested\ndata: {"a"')).toEqual([])
    expect(parse(':1}\n\nevent: connected\ndata: {}\n\n')).toEqual([
      { event: 'stop_requested', data: '{"a":1}' },
      { event: 'connected', data: '{}' },
    ])
  })

  it('understands CRLF and ignores comments (heartbeats) and unknown fields', () => {
    const parse = createSseParser()
    expect(parse(': ping\r\n\r\nid: 7\r\nretry: 10\r\nevent: x\r\ndata: 1\r\n\r\n')).toEqual([
      { event: 'x', data: '1' },
    ])
  })

  it('does not emit an event that has no data', () => {
    expect(createSseParser()('event: connected\n\n')).toEqual([])
  })
})
