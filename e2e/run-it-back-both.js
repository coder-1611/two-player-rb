// e2e/run-it-back-both.js — V456: RUN IT BACK with both players tapping it within a second (two friends at once):
// e2e/run-it-back.js in its RIB_BOTH mode (B1: the next game starts on both, Q1 0-0, one ball, no READY-guard reload).
process.env.RIB_BOTH = '1';
require('./run-it-back.js');
