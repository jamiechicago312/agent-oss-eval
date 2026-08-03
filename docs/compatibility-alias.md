# Compatibility alias policy

`oss-eval` is the only primary package for v0.1. The `agent-oss-eval` name is
reserved as a future compatibility alias; it is not published by this repository
and must never contain a separate implementation.

If the alias is published after `oss-eval` is released, it will be a deprecation
package that points users to `oss-eval` and depends on the matching `oss-eval`
version. Its executable and exports must forward to the primary package, and a
packed-artifact smoke test must prove that behavior. No placeholder alias will be
published before the primary package is usable.
