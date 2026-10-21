async (page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  const chunks = []
  cdp.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => chunks.push(chunk))
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  const raw = chunks.join('')
  const snapshot = JSON.parse(raw)
  const fields = snapshot.snapshot.meta.node_fields
  const width = fields.length
  const typeIndex = fields.indexOf('type')
  const nameIndex = fields.indexOf('name')
  const sizeIndex = fields.indexOf('self_size')
  if ([typeIndex, nameIndex, sizeIndex].some(i => i < 0)) throw new Error('Unrecognized heap schema')
  const types = snapshot.snapshot.meta.node_types[typeIndex]
  const totals = new Map()
  for (let offset = 0; offset < snapshot.nodes.length; offset += width) {
    const type = types[snapshot.nodes[offset + typeIndex]]
    const name = snapshot.strings[snapshot.nodes[offset + nameIndex]]
    const bytes = snapshot.nodes[offset + sizeIndex]
    const key = `${type}:${name}`
    const entry = totals.get(key) || { type, name, count: 0, selfBytes: 0 }
    entry.count++
    entry.selfBytes += bytes
    totals.set(key, entry)
  }
  const entries = [...totals.values()]
  await cdp.detach()
  return { snapshotNodeCount: snapshot.snapshot.node_count, snapshotEdgeCount: snapshot.snapshot.edge_count, snapshotJsonBytes: raw.length, topSelfBytes: entries.sort((a, b) => b.selfBytes - a.selfBytes).slice(0, 20).map(e => ({ ...e, name: e.name.slice(0, 120), fullNameLength: e.name.length })), audioRelated: entries.filter(e => e.type !== 'string' && e.name.length < 160 && /AudioBuffer|AudioContext|ToneBuffer|Sampler|Float32Array|ArrayBufferData/.test(e.name)), caveat: 'Heap snapshot can force garbage collection. Self sizes and audio wrapper counts are diagnostic only, not native/total/peak memory qualification. The snapshot is summarized in the CLI runtime; raw heap is not injected into the page.' }
}
