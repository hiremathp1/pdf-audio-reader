# Roadmap
## Primary
- [x] Figure out modules to use
- [x] Canvas drawer to highlight text
- [x] Extract text from pdf
- [x] Highlight position algorithm
- [x] Transcription reader
- [x] Bind props for onPlay, onPlaying, onPause, onEnd and onSeek of media
- [x] Load files from GET url params

## Secondary/Non essential
- [x] Auto focus player at page render, so shortcuts work
- [x] Scroll page with search (This is also used on text transcription highlight)

## Optimizations
- [ ] Word highlight changing lag?

# PDF Reader

This is a simple pdf viewer that has an audio player embed. The goal is to
highlight the read text as the audio player plays.

This application takes input from 3 files: The pdf itself to be rendered and
highlighted, a timestamped list of the words (a transcription) on the format `{"time":510,"type":"word","start":22,"end":27,"value":"dolls"}` and the audio file from which this transcription was made.

## Resources/Dependencies

The libraries used on this project.

* react-pdf: https://www.npmjs.com/package/react-pdf#standard-browserify-and-others for pdf rendering.
* react-h5-audio-player: https://www.npmjs.com/package/react-h5-audio-player
* https://www.npmjs.com/package/string-similarity --> For thresholding similar words


## Usage

Pass in the url's for the pdf file, the transcript text and the audio as url get parameters:
`audio, text, pdf` if any if missing then a default example will be loaded.

Example:
```
http://your.project.com:3000/?audio=http://10.42.0.1:8000/colibosco.mp3&text=http://10.42.0.1:8000/colibosco.txt&pdf=http://10.42.0.1:8000/colibosco.pdf
```

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app). You might as well replace yarn with npm on the examples bellow.

### Available Scripts

In the project directory, you can run:

#### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

#### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

#### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

### Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
