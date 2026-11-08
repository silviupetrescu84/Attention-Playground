<!--
Guidelines for adding to this README (existing content stays as it is):
- Only describe what the project is about, not how the code works.
- Only add big things, such as a new minigame, in 1-2 lines max.
- Commands for setting up or running the project are fine.
-->

# Attention Playground

Attention Playground is an open-source, browser-based collection of 10 small
games connected to Practice of Happiness.

## Games

- **Emotions Rise**: emotions float up in bubbles; tap the good ones before
  they escape and leave the bad ones alone.

## Prerequisites

- [Node.js 22.21 or newer](https://nodejs.org/)
- npm 10.9 or newer (included with Node.js)
- [Visual Studio Code](https://code.visualstudio.com/) (optional)

If you use `nvm`, run `nvm use` in the project folder to select the Node major
version recorded in `.nvmrc`.

## Get started

Clone the repository, open it in VS Code, and install the dependencies:

```sh
git clone <repository-url> attention-playground
cd attention-playground
code .
npm install
```

The committed `package-lock.json` keeps installations reproducible.

Start the development server:

```sh
npm run dev
```

Open the local URL printed in the terminal (usually `http://localhost:5173`).

## Run the tests

```sh
npm test
```

## License and rights

The source code is available under the [MIT License](LICENSE).

The bundled Roboto Condensed font is © Google and available under the
[SIL Open Font License 1.1](https://openfontlicense.org).

The Practice of Happiness name, trademarks, artwork, and other assets may be
subject to separate rights and are not granted by this project's MIT license.
No proprietary Practice of Happiness artwork or assets are included here.
