const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// A view change during a screensaver fade must not leave the old view half faded.
// Exercises switchUnderlaySections / settleUnderlayTransitions from the source file with a
// minimal fake of Home Assistant's sections view.
const source = fs.readFileSync(path.join(__dirname, "../wallpanel-src.js"), "utf8");

function extractFunction(name) {
	const start = source.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
	assert.ok(start >= 0, `function ${name} must be present`);
	let depth = 0;
	for (let i = source.indexOf("{", start); i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
	}
	throw new Error(`Unbalanced function ${name}`);
}

const sectionsStart = source.indexOf("// underlay-sections:begin");
const sectionsEnd = source.indexOf("// underlay-sections:end", sectionsStart);

function createEnv() {
	class FakeStyle {
		constructor() {
			this.values = {};
		}
		set transition(v) {
			this.setProperty("transition", v);
		}
		get transition() {
			return this.values.transition || "";
		}
		set opacity(v) {
			this.setProperty("opacity", v);
		}
		get opacity() {
			return this.values.opacity || "";
		}
		set pointerEvents(v) {
			this.setProperty("pointer-events", v);
		}
		get pointerEvents() {
			return this.values["pointer-events"] || "";
		}
		setProperty(k, v) {
			if (v === "" || v === undefined || v === null) delete this.values[k];
			else this.values[k] = String(v);
		}
		removeProperty(k) {
			delete this.values[k];
		}
	}
	const mq = { matches: false };
	const makeSection = (role) => {
		const section = { style: new FakeStyle(), config: { type: "grid", wallpanel_screensaver: role } };
		// HA hides the section from its visibility conditions (the WallPanel media query).
		Object.defineProperty(section, "hidden", {
			get: () => (role === "only" ? !mq.matches : role === "show" ? false : mq.matches)
		});
		return section;
	};
	const makeView = () => ({
		sections: [makeSection(undefined), makeSection("only"), makeSection("show")],
		header: { style: new FakeStyle(), config: {} }
	});
	const views = { kitchen: makeView(), gate: makeView() };
	const env = { views, current: "kitchen", mq };
	const factory = new Function(
		"env",
		`
		const logger = { debug() {}, warning() {} };
		const config = { screensaver_underlay: true };
		const requestAnimationFrame = (cb) => setTimeout(cb, 1);
		${source.slice(sectionsStart, sectionsEnd)}
		const underlayMediaQuery = createUnderlayMediaQuery(EventTarget, Event);
		underlayMediaQuery.list.addEventListener("change", (e) => { env.mq.matches = e.matches; });
		const underlaySectionHook = null;
		let underlaySwitchSequence = 0;
		let underlaySettleSequence = 0;
		const underlayFadedElements = new Set();
		let underlayHuiRoot = null;
		const UNDERLAY_BACKGROUND_HIDDEN_ATTR = "x";
		function getHuiRoot() { return null; }
		function setUnderlayBackgroundHidden() {}
		function querySectionsViews(selector) {
			const view = env.views[env.current];
			return selector === "hui-section" ? view.sections.slice() : [view.header];
		}
		function getUnderlaySections() { return querySectionsViews("hui-section"); }
		${extractFunction("setUnderlayHeaderFooterState")}
		${extractFunction("getUnderlaySwitchedSections")}
		${extractFunction("prepareUnderlaySections")}
		${extractFunction("switchUnderlaySections")}
		${extractFunction("setSectionsOpacity")}
		${extractFunction("clearSectionsFade")}
		${extractFunction("settleUnderlayTransitions")}
		${extractFunction("sleep")}
		${extractFunction("nextAnimationFrames")}
		return { switchUnderlaySections, settleUnderlayTransitions, underlayMediaQuery };
		`
	);
	return Object.assign(env, factory(env));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function assertClean(view) {
	view.sections.forEach((s) => assert.deepEqual(s.style.values, {}));
}

test("view change during fade-in leaves no faded sections behind", async () => {
	const env = createEnv();
	const starting = env.switchUnderlaySections(true, 0.2);
	await wait(50);
	// Kitchen default section is fading out.
	assert.equal(env.views.kitchen.sections[0].style.opacity, "0");
	// Doorbell: screensaver stopped and panel navigated to the gate view.
	env.current = "gate";
	env.switchUnderlaySections(false, 0); // what stopScreensaver(0) does
	env.settleUnderlayTransitions(false); // what locationChanged does now
	assert.equal(await starting, false);
	await wait(300);
	assertClean(env.views.kitchen);
	assertClean(env.views.gate);
	assert.equal(env.views.kitchen.header.style.opacity, "");
	assert.equal(env.mq.matches, false);
});

test("view change during fade-out leaves no faded sections behind", async () => {
	const env = createEnv();
	await env.switchUnderlaySections(true, 0);
	assert.equal(env.mq.matches, true);
	const stopping = env.switchUnderlaySections(false, 0.2);
	await wait(50);
	env.current = "gate";
	env.settleUnderlayTransitions(false);
	assert.equal(await stopping, false);
	await wait(300);
	assertClean(env.views.kitchen);
	assert.equal(env.mq.matches, false);
});

test("settle while the screensaver keeps running hides the new view's header", async () => {
	const env = createEnv();
	const starting = env.switchUnderlaySections(true, 0.2);
	await wait(50);
	env.current = "gate";
	env.settleUnderlayTransitions(true);
	assert.equal(await starting, false);
	assert.equal(env.mq.matches, true);
	assertClean(env.views.kitchen);
	assert.equal(env.views.kitchen.header.style.opacity, "");
	assert.equal(env.views.gate.header.style.opacity, "0");
	assert.equal(env.views.gate.header.style.pointerEvents, "none");
});
