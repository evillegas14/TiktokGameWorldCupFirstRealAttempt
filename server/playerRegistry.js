export class PlayerRegistry {
  constructor(maxPerTeam = Infinity) {
    this.players = new Map();
    this.maxPerTeam = maxPerTeam > 0 ? maxPerTeam : Infinity;
  }

  join(uniqueId, nickname, profilePictureUrl, team) {
    const existing = this.players.get(uniqueId);
    if (existing && existing.team === team) return null;
    // Cap per-team headcount so a busy live can't spawn unbounded physics bodies.
    const counts = this.counts();
    const teamCount = team === 1 ? counts.left : counts.right;
    if (teamCount >= this.maxPerTeam) return null;
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
