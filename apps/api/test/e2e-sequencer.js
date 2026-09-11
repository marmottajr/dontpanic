/**
 * Fixed (alphabetical) order for the e2e test files.
 *
 * Jest's default sequencer orders files by what failed and by how long each one
 * took on the previous run — information it reads from an on-disk cache. The
 * consequence: two runs of the same command only went through the files in the
 * same order by luck, and one and the same contamination bug showed up as 2
 * failures one run and 28 the next. A fixed order fixes no contamination at all;
 * what it does is make the result reproducible, which is what lets contamination
 * be fixed.
 *
 * `shard` is not implemented: the e2e suite runs with `--runInBand`, in a single
 * process.
 */
class E2ESequencer {
  sort(tests) {
    return [...tests].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Nothing to store: the order does not depend on previous runs. */
  cacheResults() {}

  /** Used by `--onlyFailures`; with no cache, no failure is known up front. */
  allFailedTests(tests) {
    return this.sort(tests);
  }
}

module.exports = E2ESequencer;
