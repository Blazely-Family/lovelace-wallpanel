const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Exercise the light sensor reporter's decision logic without a browser.
const source = fs.readFileSync(path.join(__dirname, "../wallpanel-src.js"), "utf8");
const start = source.indexOf("const lightSensorReporter = {");
const end = source.indexOf("\nfunction updateConfig() {", start);
assert.ok(start >= 0 && end > start, "Light sensor reporter must be present");
const reporter = new Function(`${source.slice(start, end)}; return lightSensorReporter;`)();

const cfg = {
	light_sensor_min_change: 1,
	light_sensor_min_change_percent: 10,
	light_sensor_report_interval: 60
};

test("parses the light sensor from Fully's sensor info", () => {
	const info = JSON.stringify([
		{ type: 1, values: [0, 9.8, 0] },
		{ type: 5, name: "tcs37013_als", values: [39] }
	]);
	assert.equal(reporter.parseLux(info), 39);
	assert.equal(reporter.parseLux("[]"), null);
	assert.equal(reporter.parseLux("not json"), null);
});

test("the first reading is always reported", () => {
	assert.equal(reporter.shouldReport(cfg, null, 0, 40, 1000), true);
});

test("small jitter at room light is ignored", () => {
	assert.equal(reporter.shouldReport(cfg, 39, 0, 40, 1000), false);
	assert.equal(reporter.shouldReport(cfg, 40, 0, 37, 1000), false);
});

test("lights going off or on are reported at once", () => {
	assert.equal(reporter.shouldReport(cfg, 40, 0, 2, 1000), true);
	assert.equal(reporter.shouldReport(cfg, 0, 0, 3, 1000), true);
	assert.equal(reporter.shouldReport(cfg, 4, 0, 11, 1000), true);
});

test("a 1 lux change is reported in the dark", () => {
	assert.equal(reporter.shouldReport(cfg, 4, 0, 5, 1000), true);
	assert.equal(reporter.shouldReport(cfg, 5, 0, 5, 1000), false);
});

test("an unchanged value is sent again after the report interval", () => {
	assert.equal(reporter.shouldReport(cfg, 40, 0, 40, 59999), false);
	assert.equal(reporter.shouldReport(cfg, 40, 0, 40, 60000), true);
});

test("values are clamped to the helper's range", () => {
	assert.equal(reporter.clamp(5000, 0, 2000), 2000);
	assert.equal(reporter.clamp(-1, 0, 2000), 0);
	assert.equal(reporter.clamp(12, undefined, undefined), 12);
});
