// Deliberately incompatible fixture: completing immediately must fail replay
// against an episode history that waited for signals and scheduled children.
async function episodeWorkflow() { return 'incompatible-immediate-completion'; }
module.exports = { episodeWorkflow };
