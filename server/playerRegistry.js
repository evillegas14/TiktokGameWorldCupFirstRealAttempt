export class PlayerRegistry {
  constructor() {
    this.players = new Map();
  }

  join(uniqueId, nickname, profilePictureUrl, team) {
    const existing = this.players.get(uniqueId);
    if (existing && existing.team === team) return null;
    const record = { uniqueId, nickname, profilePictureUrl, team };
    this.players.set(uniqueId, record);
    return record;
  }

  remove(uniqueId) {
    return this.players.delete(uniqueId);
  }

  clear() {
    this.players.clear();
  }

  counts() {
    let left = 0, right = 0;
    for (const p of this.players.values()) {
      if (p.team === 1) left++;
      else if (p.team === 2) right++;
    }
    return { left, right };
  }

  all() {
    return [...this.players.values()];
  }
}
