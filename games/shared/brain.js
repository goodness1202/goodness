// shared/brain.js — the "dish brain"
// A small MLP (~200-400 synapses) trained with Q-learning + experience replay.
// Actions followed by a calm beat (positive dopamine) get reinforced;
// actions followed by noise (negative dopamine) get suppressed.
// Like cortical cells in a dish, it learns from reward timing alone.
(function () {
  function makeRNG(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    };
  }
  function gauss(rng, scale) {
    // Irwin-Hall approximation of a Gaussian
    return (rng() + rng() + rng() + rng() - 2) * scale;
  }

  window.DishBrain = class DishBrain {
    constructor(opts = {}) {
      const {
        inputSize, outputSize, hiddenSize = 16,
        lr = 0.02, gamma = 0.97,
        epsilon = 1.0, epsilonMin = 0.04, epsilonDecay = 0.9994,
        seed = 1
      } = opts;
      this.rng = makeRNG(seed);
      this.inputSize = inputSize;
      this.outputSize = outputSize;
      this.hiddenSize = hiddenSize;
      this.lr = lr;
      this.gamma = gamma;
      this.epsilon = epsilon;
      this.epsilonMin = epsilonMin;
      this.epsilonDecay = epsilonDecay;

      const s1 = Math.sqrt(2 / inputSize);
      const s2 = Math.sqrt(2 / hiddenSize);
      this.W1 = new Float64Array(inputSize * hiddenSize);
      this.b1 = new Float64Array(hiddenSize);
      this.W2 = new Float64Array(hiddenSize * outputSize);
      this.b2 = new Float64Array(outputSize);
      for (let i = 0; i < this.W1.length; i++) this.W1[i] = gauss(this.rng, s1);
      for (let i = 0; i < this.W2.length; i++) this.W2[i] = gauss(this.rng, s2);

      // Target network (same shape) for stable Q targets
      this.W2t = new Float64Array(this.W2);
      this.b2t = new Float64Array(this.b2);

      // Momentum buffers
      this.mW1 = new Float64Array(this.W1.length);
      this.mb1 = new Float64Array(hiddenSize);
      this.mW2 = new Float64Array(this.W2.length);
      this.mb2 = new Float64Array(outputSize);
      this.momentum = 0.9;

      this.memory = [];
      this.maxMemory = 4000;
      this.minMemory = 256;
      this.batchSize = 48;
      this.frames = 0;
      this.loss = 0;
      this.lastTD = 0;
      this.targetUpdates = 0;
    }

    forward(x) {
      const I = this.inputSize, H = this.hiddenSize, O = this.outputSize;
      const h = new Float64Array(H);
      for (let j = 0; j < H; j++) {
        let sum = this.b1[j];
        for (let i = 0; i < I; i++) sum += x[i] * this.W1[i * H + j];
        h[j] = sum > 0 ? sum : 0; // ReLU
      }
      const q = new Float64Array(O);
      for (let k = 0; k < O; k++) {
        let sum = this.b2[k];
        for (let j = 0; j < H; j++) sum += h[j] * this.W2[j * O + k];
        q[k] = sum;
      }
      return { q, h };
    }

    forwardTarget(x) {
      const H = this.hiddenSize, O = this.outputSize;
      const h = new Float64Array(H);
      for (let j = 0; j < H; j++) {
        let sum = this.b1[j];
        for (let i = 0; i < this.inputSize; i++) sum += x[i] * this.W1[i * H + j];
        h[j] = sum > 0 ? sum : 0;
      }
      const q = new Float64Array(O);
      for (let k = 0; k < O; k++) {
        let sum = this.b2t[k];
        for (let j = 0; j < H; j++) sum += h[j] * this.W2t[j * O + k];
        q[k] = sum;
      }
      return q;
    }

    act(state, epsilonOverride) {
      const eps = epsilonOverride === undefined ? this.epsilon : epsilonOverride;
      if (this.rng() < eps) return Math.floor(this.rng() * this.outputSize);
      const { q } = this.forward(state);
      let best = 0;
      for (let k = 1; k < this.outputSize; k++) if (q[k] > q[best]) best = k;
      return best;
    }

    remember(s, a, r, s2, done) {
      this.memory.push({ s: new Float64Array(s), a, r, s2: new Float64Array(s2), done });
      if (this.memory.length > this.maxMemory) this.memory.shift();
    }

    trainBatch() {
      if (this.memory.length < this.minMemory) return 0;
      const n = Math.min(this.batchSize, this.memory.length);
      const I = this.inputSize, H = this.hiddenSize, O = this.outputSize;
      const gW1 = new Float64Array(I * H);
      const gB1 = new Float64Array(H);
      const gW2 = new Float64Array(H * O);
      const gB2 = new Float64Array(O);
      let loss = 0;

      for (let t = 0; t < n; t++) {
        const mem = this.memory[(this.rng() * this.memory.length) | 0];
        const f = this.forward(mem.s);
        let target = mem.r;
        if (!mem.done) {
          const q2 = this.forwardTarget(mem.s2);
          let maxQ = q2[0];
          for (let k = 1; k < O; k++) if (q2[k] > maxQ) maxQ = q2[k];
          target = mem.r + this.gamma * maxQ;
        }
        const td = target - f.q[mem.a];
        loss += td * td;
        this.lastTD = td;

        const dqa = f.q[mem.a] - target; // dL/dq[a]
        // Output layer: only the taken action has a gradient
        for (let j = 0; j < H; j++) gW2[j * O + mem.a] += dqa * f.h[j];
        gB2[mem.a] += dqa;
        // Hidden layer
        for (let j = 0; j < H; j++) {
          const dh = dqa * this.W2[j * O + mem.a] * (f.h[j] > 0 ? 1 : 0);
          gB1[j] += dh;
          for (let i = 0; i < I; i++) gW1[i * H + j] += dh * mem.s[i];
        }
      }

      // Slowly refresh the target network
      this.targetUpdates++;
      if (this.targetUpdates % 40 === 0) {
        this.W2t.set(this.W2);
        this.b2t.set(this.b2);
      }

      const m = this.momentum;
      const lr = this.lr / n;
      for (let i = 0; i < gW1.length; i++) {
        this.mW1[i] = m * this.mW1[i] + lr * gW1[i];
        this.W1[i] -= this.mW1[i];
      }
      for (let i = 0; i < H; i++) {
        this.mb1[i] = m * this.mb1[i] + lr * gB1[i];
        this.b1[i] -= this.mb1[i];
      }
      for (let i = 0; i < gW2.length; i++) {
        this.mW2[i] = m * this.mW2[i] + lr * gW2[i];
        this.W2[i] -= this.mW2[i];
      }
      for (let i = 0; i < O; i++) {
        this.mb2[i] = m * this.mb2[i] + lr * gB2[i];
        this.b2[i] -= this.mb2[i];
      }

      this.loss = loss / n;
      this.frames++;
      return this.loss;
    }

    decayEpsilon() {
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
      return this.epsilon;
    }
  };
})();
