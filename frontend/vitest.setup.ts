/**
 * jsdom gaps that would otherwise make correct component code throw in
 * tests. Each of these exists in every real browser — they're stubbed
 * here rather than guarded in the components, because contorting
 * production code around a test environment's missing APIs is how you
 * end up shipping defensive checks that protect nothing.
 */

// jsdom implements neither Element.scrollTo nor Element.scrollIntoView.
// ClaraChat uses scrollTo to keep the latest message in view.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
