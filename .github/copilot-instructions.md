# Carpet City

This repository contains an open-world game where you drive a car in a world inspired by a childhood gaming carpet pattern.

Images of the pattern can be found in the root `images` directory.

## Technology stack

Client-only application using Three.js, TypeScript, HTML, and CSS. Runs on a static web server eligible for hosting via GitHub Pages.

## How it works?

The game renders a 3D world based on a carpet pattern using Three.js. The player controls a car that can drive around this world. The environment, including the carpet pattern, is generated and displayed in real-time within the browser.

The pattern of the carpet is used as the basis for generating the 3D world. The game should follow the layout and design of the carpet pattern closely, ensuring that the virtual environment mirrors the visual elements of the original carpet.

Each element of the pattern is translated into corresponding 3D objects and textures within the game environment. Words and captions found in the pattern are replaced with English text.

The pattern is repeated multiple times so the car can drive over an extended area, creating the illusion of a vast, continuous world.

## Controls

- Use the arrow keys or WASD to drive the car.
- Use the mouse to look around.
