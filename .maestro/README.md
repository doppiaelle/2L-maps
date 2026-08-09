# Maestro flows

The three journeys of [`../docs/03_USER_JOURNEYS.md`](../docs/03_USER_JOURNEYS.md), written as
flows and **not yet run**.

They need a device or an emulator, which this development environment has neither of
([ADR-0014](../docs/adr/0014-android-first-verification.md)). They are committed anyway, for two
reasons: writing them is what forces the screens to carry stable `testID`s, and a flow that
exists is a flow somebody can run the day the hardware does. A flow written after the first
device session is a flow written to match whatever the app happened to do.

## Running them

```bash
maestro test .maestro/j1-first-route.yaml
```

The app id is `com.doppiaelle.twolmaps`, matching `app.config.ts`. Flows assume a signed-in
account and an empty draft; `j1` starts by clearing state.

## What they do not cover

The handoff itself. A flow can tap **Start**, but what happens next is Google Maps, and Maestro
cannot assert inside another app. The flows stop at the boundary and say so — that verification
is a human with a phone, listed in [`../docs/29_DEFINITION_OF_DONE.md`](../docs/29_DEFINITION_OF_DONE.md).
