# Screensaver
WallPanel offers a screensaver that presents a media slideshow.
Images, videos and websites are supported as media content.

!!! tip
    Clicking on the far right side of the screen while the screensaver is active will display the next media item.
    Clicking on the left side will show the previous media item and reverse the playback order.
    You can also use a swipe gesture to switch between media items.

## Screensaver entity
You can create an input_boolean helper in HA and set `screensaver_entity` to this entity id.
When the screensaver starts this input_boolean will be set to `on` and to `off` when the screensaver stops.
It is also possible to start and stop the screensaver by changing this input_boolean.

You can use the screensaver entity in an automation to switch the screensaver on and off.
For example, if you want to turn off the screensaver when a motion sensor detects movement, you can do this:

1. Create an Switch Helper (input_boolean) in HA, name it `kitchen_wallpanel_screensaver` for example.
2. Set the `screensaver_entity` in the wallpanel configuration:
```yaml
wallpanel:
  screensaver_entity: input_boolean.kitchen_wallpanel_screensaver
```
3. Create an automation in HA that turns off the entity `input_boolean.kitchen_wallpanel_screensaver` to disable the screensaver:
```yaml
...
- action: input_boolean.turn_off
  target:
    entity_id: input_boolean.kitchen_wallpanel_screensaver
```

!!! Tip
    If you have several wallpanels, you should use a separate Switch Helper (input_boolean) for each wallpanel.
    You can use [Configuration placeholders](configuration.md#dynamic-configuration-using-placeholders) or [Profiles](configuration.md#profiles) for this.

## Underlay mode (Blazely fork)
With `screensaver_underlay: true` the screensaver media is shown **behind** the live dashboard instead of covering it,
so cards stay visible and interactive on top of the slideshow.

```yaml
wallpanel:
  enabled: true
  screensaver_underlay: true
  screensaver_start_navigation_path: /home-panel/kitchen
```

### Sections during the screensaver
Each section of a sections view is in one of three states:

| State | Section configuration |
| ----- | --------------------- |
| Hidden while the screensaver runs *(default)* | nothing |
| Always visible | `wallpanel_screensaver: show` |
| Visible only while the screensaver runs | `wallpanel_screensaver: only` |

```yaml
# Always visible (e.g. a clock)
- type: grid
  wallpanel_screensaver: show
  cards: ...

# Visible only while the screensaver runs
- type: grid
  wallpanel_screensaver: only
  cards: ...
```

The switching is done by Home Assistant's own visibility logic. WallPanel answers the media query
`(wallpanel-screensaver)` itself: it matches while the screensaver runs. For default sections, WallPanel adds
`not screen (wallpanel-screensaver)` to the visibility conditions it hands to the section, and for
`wallpanel_screensaver: only` sections a `screen (wallpanel-screensaver)` condition (wrapped in an equivalent `and`
condition, so that Home Assistant subscribes it to WallPanel's media query even if the section was rendered before
WallPanel loaded). Your stored dashboard configuration is not changed. Sections keep their other visibility
conditions, and edit mode shows every section.

Without WallPanel the media query does not match, so sections show their normal (screensaver off) state, and
`wallpanel_screensaver: only` sections are visible like any other section. To keep a screensaver-only section hidden
even before WallPanel has loaded (for example on a slow device where it could otherwise show briefly while the page
loads), also give it the condition natively:

```yaml
- type: grid
  wallpanel_screensaver: only
  visibility:
    - condition: screen
      media_query: "(wallpanel-screensaver)"
  cards: ...
```

The view header and footer follow the same rule: put `wallpanel_screensaver: show` or `wallpanel_screensaver: only`
in the view's `header` or `footer` configuration, or leave it out to hide it while the screensaver runs. They are
faded with opacity, so the layout does not change.

```yaml
header:
  wallpanel_screensaver: show
  card:
    type: markdown
    content: "# Welcome home"
footer:
  card:
    type: custom:navbar-card
```

`screensaver_entity` is optional in underlay mode. It still reflects and controls the screensaver state, for example
for automations, but the dashboard layout no longer depends on it.

### Styling during the screensaver
`screensaver_underlay_style` adds CSS to the dashboard's `hui-root` element. CSS custom properties set on
`:host` reach every card, so this is the place to restyle cards while the screensaver runs, for example a
theme's card background variable.

- `:host([wallpanel-underlay-background-hidden])` matches while the screensaver runs (from the moment the
  backgrounds start fading out until they start fading back in).
- `--wallpanel-screensaver` is a number that goes from `0` to `1` over the background fade when the
  screensaver starts, and back when it stops. Use it in `calc()` to fade values smoothly; a rule under the
  attribute above switches at once.

Example for the Frosted Glass Lite themes: make the card glass less see-through during the screensaver at
about the same shade (lighter colour, higher opacity), fading with the backgrounds:

```yaml
wallpanel:
  screensaver_underlay: true
  screensaver_underlay_style: |
    :host {
      --ha-card-glass-tint: rgba(
        calc(28 + 16 * var(--wallpanel-screensaver)),
        calc(29 + 16 * var(--wallpanel-screensaver)),
        calc(33 + 17 * var(--wallpanel-screensaver)),
        calc(0.54 + 0.24 * var(--wallpanel-screensaver)));
    }
```

Only numbers can fade. Images (textures, gradients) in such a rule switch at once.

Avoid `backdrop-filter` (blur) on cards: with a moving slideshow behind them it is recalculated on every
frame and is expensive on low-power devices.

### Transitions

- **Start:** the first media item is loaded while the dashboard is still unchanged. The media is then revealed by fading
  Home Assistant's own panel and view backgrounds out over it, while the sections that are hidden during the
  screensaver fade out and the sections shown only during the screensaver fade in.
- **Stop:** the backgrounds fade back in over the media while the sections are switched back the same way.
- Always visible sections are never faded.
- Every start and stop fades, including ones triggered by `screensaver_entity` or the `start` / `stop`
  [commands](configuration.md#commands-from-home-assistant).

!!! note
    Home Assistant 2026.11 made `home-assistant-main` an isolated stacking context while leaving it `display: inline`.
    Firefox does not layer the content of such an element correctly, which put the media on top of most cards.
    Underlay mode sets `home-assistant-main` to `display: block` to avoid this. This does not change the layout.

!!! note
    `screensaver_underlay` is applied when WallPanel starts. Reload the page after changing it.

## Tracking the current displayed media in an entity
You can create an input_text helper in HA and set the configuration option `image_url_entity` to this entity id.
Make sure that the maximum length is not too short so that the image URL fits in (note that the default maximum length for input_text helpers created from the HA web interface is 100 characters, but you can create your own input_text in `configuration.yaml` of maximum length 255). In case the image path is too long for the helper, you will get a warning in HA logs (sounding like `Invalid value: ... (length range 0 - 100)`) and the entity will not get updated.
When the screensaver changes the active image, the URL of the new image is stored in this entity.
