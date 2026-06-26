import { EventEmitter } from 'events';

export const Phase = Object.freeze({
  VOTE: 'vote',
  MATCH: 'match',
  WINNER: 'winner',
});

export class MatchState extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.phase = Phase.VOTE;
    this.teamA = null;
    this.teamB = null;
    this.score = { 1: 0, 2: 0 };
    this.likesTotal = 0;
    this.likesSinceLastSpawn = 0;
  }

  startMatch(teamA, teamB) {
    this.teamA = teamA;
    this.teamB = teamB;
    this.score = { 1: 0, 2: 0 };
    this.phase = Phase.MATCH;
    this.emit('match:start', { teamA, teamB, goalsToWin: this.config.goalsToWin });
  }

  scoreGoal(team) {
    if (this.phase !== Phase.MATCH) return;
    this.score[team] = (this.score[team] || 0) + 1;
    this.emit('match:goal', { team, score: { ...this.score } });
    if (this.score[team] >= this.config.goalsToWin) {
      this.phase = Phase.WINNER;
      const winner = team === 1 ? this.teamA : this.teamB;
      this.emit('match:end', { winner, winnerTeam: team, finalScore: { ...this.score } });
    }
  }

  enterVote() {
    this.phase = Phase.VOTE;
    this.emit('phase:vote');
  }

  addLikes(count) {
    this.likesTotal += count;
    this.likesSinceLastSpawn += count;
    const milestone = this.config.ballsPerLikeMilestone;
    const milestonesReached = Math.floor(this.likesSinceLastSpawn / milestone);
    if (milestonesReached > 0) {
      this.likesSinceLastSpawn -= milestonesReached * milestone;
      this.emit('likes:milestone', { milestones: milestonesReached });
    }
  }

  resetLikes() {
    this.likesTotal = 0;
    this.likesSinceLastSpawn = 0;
  }

  snapshot() {
    return {
      phase: this.phase,
      teamA: this.teamA,
      teamB: this.teamB,
      score: { ...this.score },
      likesTotal: this.likesTotal,
      likesProgress: this.likesSinceLastSpawn,
      likesMilestone: this.config.ballsPerLikeMilestone,
      goalsToWin: this.config.goalsToWin,
    };
  }
}
