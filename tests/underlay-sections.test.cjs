const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Exercise the self-contained underlay section helpers from the source file.
const source = fs.readFileSync(path.join(__dirname, "../wallpanel-src.js"), "utf8");
const start = source.indexOf("// underlay-sections:begin");
const end = source.indexOf("// underlay-sections:end", start);
assert.ok(start >= 0 && end > start, "Underlay section helpers must be present");
const underlay = new Function(
	`${source.slice(start, end)}
	return {
		UNDERLAY_MEDIA_QUERY,
		getUnderlaySectionRole,
		withUnderlayVisibility,
		createUnderlayMediaQuery,
		installUnderlayMatchMedia,
		installUnderlaySectionConfigHook
	};`
)();

const SHOW = { condition: "screen", media_query: "(wallpanel-screensaver)" };
const HIDE = { condition: "not", conditions: [SHOW] };
const freeze = (value) => {
	Object.values(value).forEach((child) => {
		if (child && typeof child === "object") freeze(child);
	});
	return Object.freeze(value);
};

test("section roles", () => {
	const role = underlay.getUnderlaySectionRole;
	assert.equal(role({ type: "grid" }), "default");
	assert.equal(role({ type: "grid", wallpanel_screensaver: "show" }), "always");
	assert.equal(role({ type: "grid", wallpanel_screensaver: "only" }), "only");
	assert.equal(role({ type: "grid", visibility: [SHOW] }), "only");
	assert.equal(role({ visibility: [{ condition: "screen", media_query: "  (WallPanel-Screensaver) " }] }), "only");
	assert.equal(role({ visibility: [HIDE] }), "default");
	assert.equal(role({ visibility: [{ condition: "screen", media_query: "(max-width: 600px)" }] }), "default");
	assert.equal(role(undefined), "default");
});

test("default sections get the hide rule appended to a copy", () => {
	const own = { condition: "state", entity: "binary_sensor.warning", state: "on" };
	const original = freeze({ type: "grid", visibility: [own] });
	const result = underlay.withUnderlayVisibility(original);
	assert.notEqual(result, original);
	assert.deepEqual(result.visibility, [own, HIDE]);
	assert.deepEqual(original.visibility, [own]);
	assert.equal(result.type, "grid");
});

test("sections without visibility get just the hide rule", () => {
	assert.deepEqual(underlay.withUnderlayVisibility({ type: "grid" }).visibility, [HIDE]);
});

test("adding the rule is idempotent", () => {
	const once = underlay.withUnderlayVisibility({ type: "grid" });
	assert.equal(underlay.withUnderlayVisibility(once), once);
	const explicit = { type: "grid", visibility: [HIDE] };
	assert.equal(underlay.withUnderlayVisibility(explicit), explicit);
});

test("always and native only sections are not changed", () => {
	const always = { type: "grid", wallpanel_screensaver: "show", visibility: [{ condition: "user", users: ["x"] }] };
	assert.equal(underlay.withUnderlayVisibility(always), always);
	const only = { type: "grid", visibility: [SHOW] };
	assert.equal(underlay.withUnderlayVisibility(only), only);
});

test("only sections marked by key get the show rule", () => {
	const result = underlay.withUnderlayVisibility({ type: "grid", wallpanel_screensaver: "only" });
	assert.deepEqual(result.visibility, [SHOW]);
});

test("strategy sections and non-objects are passed through", () => {
	const strategy = { strategy: { type: "custom:x" } };
	assert.equal(underlay.withUnderlayVisibility(strategy), strategy);
	assert.equal(underlay.withUnderlayVisibility(null), null);
	assert.equal(underlay.withUnderlayVisibility("x"), "x");
});

test("the media query list reports and announces changes", () => {
	const mq = underlay.createUnderlayMediaQuery(EventTarget, Event);
	const seen = [];
	mq.list.addEventListener("change", (event) => seen.push(["listener", event.matches, event.media]));
	mq.list.addListener((event) => seen.push(["legacy", event.matches]));
	mq.list.onchange = (event) => seen.push(["onchange", event.matches]);
	assert.equal(mq.list.matches, false);
	assert.equal(mq.list.media, "(wallpanel-screensaver)");
	assert.equal(mq.setMatches(true), true);
	assert.equal(mq.list.matches, true);
	assert.equal(mq.matches, true);
	assert.equal(mq.setMatches(true), false);
	assert.deepEqual(seen, [
		["listener", true, "(wallpanel-screensaver)"],
		["legacy", true],
		["onchange", true]
	]);
});

test("matchMedia returns the controlled list only for the underlay query", () => {
	const calls = [];
	const win = {
		matchMedia(query) {
			calls.push([this, query]);
			return { media: query, matches: false };
		}
	};
	const mq = underlay.createUnderlayMediaQuery(EventTarget, Event);
	assert.equal(underlay.installUnderlayMatchMedia(win, mq), true);
	assert.equal(underlay.installUnderlayMatchMedia(win, mq), false);
	assert.equal(win.matchMedia("(wallpanel-screensaver)"), mq.list);
	assert.equal(win.matchMedia(" (WALLPANEL-SCREENSAVER) "), mq.list);
	assert.equal(win.matchMedia("(max-width: 600px)").media, "(max-width: 600px)");
	assert.deepEqual(calls, [[win, "(max-width: 600px)"]]);
});

// A section element with a reactive `config` accessor on its prototype, like Lit creates.
function sectionClass() {
	class Section {
		get config() {
			return this._config;
		}
		set config(value) {
			this.assignments = (this.assignments || 0) + 1;
			this._config = value;
		}
	}
	return Section;
}

test("sections receive converted configs and the original stays recoverable", () => {
	const Section = sectionClass();
	const hook = underlay.installUnderlaySectionConfigHook(Section, underlay.withUnderlayVisibility);
	assert.ok(hook);
	const original = freeze({ type: "grid" });
	const section = new Section();
	section.config = original;
	assert.deepEqual(section.config.visibility, [HIDE]);
	assert.equal(hook.isConverted(section.config), true);
	assert.equal(hook.originalOf(section.config), original);
	assert.equal(hook.originalOf(original), original);
});

test("the same original config always maps to the same converted object", () => {
	const Section = sectionClass();
	underlay.installUnderlaySectionConfigHook(Section, underlay.withUnderlayVisibility);
	const original = { type: "grid" };
	const a = new Section();
	const b = new Section();
	a.config = original;
	b.config = original;
	assert.equal(a.config, b.config);
	const converted = a.config;
	a.config = converted;
	assert.equal(a.config, converted);
});

test("unchanged configs are passed through as is", () => {
	const Section = sectionClass();
	const hook = underlay.installUnderlaySectionConfigHook(Section, underlay.withUnderlayVisibility);
	const always = { type: "grid", wallpanel_screensaver: "show" };
	const section = new Section();
	section.config = always;
	assert.equal(section.config, always);
	assert.equal(hook.isConverted(always), false);
});

test("the hook is installed once and only on a configurable accessor", () => {
	const Section = sectionClass();
	assert.ok(underlay.installUnderlaySectionConfigHook(Section, (c) => c));
	assert.equal(underlay.installUnderlaySectionConfigHook(Section, (c) => c), null);
	class NoAccessor {}
	assert.equal(underlay.installUnderlaySectionConfigHook(NoAccessor, (c) => c), null);
	class Base {}
	Object.defineProperty(Base.prototype, "config", { configurable: false, get() {}, set() {} });
	assert.equal(underlay.installUnderlaySectionConfigHook(Base, (c) => c), null);
	assert.equal(underlay.installUnderlaySectionConfigHook(null, (c) => c), null);
});

test("an inherited accessor is wrapped where it is defined", () => {
	const Base = sectionClass();
	class Derived extends Base {}
	assert.ok(underlay.installUnderlaySectionConfigHook(Derived, underlay.withUnderlayVisibility));
	const section = new Derived();
	section.config = { type: "grid" };
	assert.deepEqual(section.config.visibility, [HIDE]);
});
