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
Combine it with `screensaver_entity` and section visibility conditions to choose which sections are shown while the screensaver runs:

```yaml
wallpanel:
  enabled: true
  screensaver_underlay: true
  screensaver_entity: input_boolean.kitchen_panel_screensaver
  screensaver_start_navigation_path: /home-panel/kitchen
```

```yaml
# A section that is only shown while the screensaver is running
- type: grid
  visibility:
    - condition: state
      entity: input_boolean.kitchen_panel_screensaver
      state: "on"
  cards: ...
```

How the transitions work:

- **Start:** the first media item is loaded while the dashboard is still unchanged. The media is then revealed by fading
  Home Assistant's own panel and view backgrounds out over it, while the sections that depend on `screensaver_entity`
  fade out. The entity is switched and the newly visible sections fade in.
- **Stop:** the backgrounds fade back in over the media while the sections are swapped back the same way.
- Sections whose `visibility` does not reference `screensaver_entity` (a clock, a calendar, ...) are never faded.
  Override this per section with `wallpanel_fade: true` or `wallpanel_fade: false` in the section's configuration.
- Changing `screensaver_entity` directly (by hand or from an automation) makes Home Assistant swap the sections
  immediately, before WallPanel can fade them. Use the `start` / `stop` [commands](configuration.md#commands-from-home-assistant)
  to get the full transition.

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
