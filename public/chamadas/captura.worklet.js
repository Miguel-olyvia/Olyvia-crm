// 4/11: o AudioWorklet da «Chamada em direto»: corta o microfone (16 kHz, mono) em blocos de 100 ms de int16,
// que é o que o motor espera. Ficheiro estático (e não um blob) por causa da Content-Security-Policy da app.
class Captura extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const x = inputs[0][0];
    if (!x) return true;
    this.buf.push(new Float32Array(x));
    this.n += x.length;
    if (this.n >= 1600) {
      const out = new Int16Array(this.n);
      let k = 0;
      for (const b of this.buf) for (let i = 0; i < b.length; i++) out[k++] = Math.max(-1, Math.min(1, b[i])) * 32767;
      this.port.postMessage(out.buffer, [out.buffer]);
      this.buf = []; this.n = 0;
    }
    return true;
  }
}
registerProcessor("captura", Captura);
