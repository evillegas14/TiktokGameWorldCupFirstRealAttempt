export class VoteState {
  constructor() {
    this.reset();
  }

  reset() {
    this.votesByUser = new Map();
    this.tally = new Map();
  }

  castVote(uniqueId, code) {
    const previous = this.votesByUser.get(uniqueId);
    if (previous === code) return false;
    if (previous) {
      this.tally.set(previous, Math.max(0, (this.tally.get(previous) || 0) - 1));
    }
    this.votesByUser.set(uniqueId, code);
    this.tally.set(code, (this.tally.get(code) || 0) + 1);
    return true;
  }

  topTwo() {
    const sorted = [...this.tally.entries()].sort((a, b) => b[1] - a[1]);
    return [sorted[0]?.[0], sorted[1]?.[0]];
  }

  tallyObject() {
    return Object.fromEntries(this.tally);
  }
}
