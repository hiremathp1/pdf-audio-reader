import React, {useEffect, useLayoutEffect, createRef, useRef, useMemo, useState} from 'react';
import {Document, Page, pdfjs} from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

//Stylesheet
import './index.css';

// Example fallback. You might want to change to an error pdf or something 
import IpdfFile from './examples/colibosco.pdf';
import Iaudio from './examples/colibosco.mp3';
import Itranscript from './examples/colibosco.txt';
////////////////////////////////////////////////////////////////////////////////////////////////////

// Adjustments
const LISTEN_INTERVAL = 50; // ms, Highlight update interval. Too low might cause high cpu usage.
const MIN_SIMILARITY = .8; // Set to 1 to only accept exact matches. 
const WORD_THRESHOLD = 30; // ms
const FORCE_ALL_WORDS_HIGHLIGHT = 1; // Forces all the words to be highlithed, but might increase latency
const MAX_DISTANCE = 2; // Do not allow more than MAX_DISTANCE words to delay if above is true
const MAX_DELAY_BETWEEN_WORDS = 200; // ms, If 2 words are closer than this they will both be highlighted
const PLAYER_STEP_SIZE = 2; // Seconds to skip on the player controls or using arrow keys
const MAX_PLAYER_SPEED_MULTIPLIER = 2; // How fast should it go (playback speed)
const PLAYER_SPEED_STEP = .25; // Steps to increase or decrese by (playback speed)

////////////////////////////////////////////////////////////////////////////////////////////////////


const options = {
  cMapUrl: `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};

// Used before comparing words from pdf to words in the transcript
function simplifyString(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/ig, '').toLowerCase();
}

function clamp(number) {
  return Math.max(PLAYER_SPEED_STEP, Math.min(number, MAX_PLAYER_SPEED_MULTIPLIER));
}

function scrollToHighlight() {
  const el = document.getElementsByClassName('wordHighlight')[0]
  if (el === undefined)
    return;
  el.scrollIntoView({behavior: 'smooth', block: 'center'})
}

function getQueryParams() {
  return window.location.search.replace('?', '').split('&').reduce((r, e) =>
    (r[e.split('=')[0]] = decodeURIComponent(e.split('=')[1]), r), {}
  );
}


function App() {
  const [pdfFile, setPdfFile] = useState('');
  const [audio, setAudio] = useState('');
  const [transcript, setTranscript] = useState('');

  const [numPages, setNumPages] = useState(null);
  const [transcriptIndex, setTranscriptIndex] = useState(0);
  const [lastLine, setLastLine] = useState({page: 0, line: 0});
  const [pagesRendered, setPagesRendered] = useState(0);
  const [transcriptedText, setTranscriptedText] = useState([]);

  const [playerSpeed, setPlayerSpeed] = useState(1);
  const [atTwoWords, setAtTwoWords] = useState(false);

  const [size, setSize] = useState({
    x: window.innerWidth,
    y: window.innerHeight
  });

  const updateSize = () =>
    setSize({
      x: window.innerWidth,
      y: window.innerHeight
    });
  useEffect(() => (window.onresize = updateSize), []);

  const audioPlayer = createRef();


  // Check for url params, if not example is loaded. This is ran only once.
  useEffect(() => {
    const urlParams = getQueryParams();
    if (urlParams.text && urlParams.audio && urlParams.pdf) {
      setPdfFile(urlParams.pdf);
      setAudio(urlParams.audio);
      setTranscript(urlParams.text);
    } else {
      console.error("Params missing. Loading example file");
      setPdfFile(IpdfFile);
      setAudio(Iaudio);
      setTranscript(Itranscript);
    }
  }, []);

  //Load transcript
  useEffect(async () => {
    if (transcript === '')
      return
    const pages = document.getElementsByClassName("react-pdf__Page")
    if (pagesRendered != pages.length)
      return

    //Apply offset
    const urlParams = getQueryParams();
    if (urlParams.offset) {
      const [x, y] = urlParams.offset.split(",");
      const textLayer = document.getElementsByClassName("react-pdf__Page__textContent")
      if (!textLayer) return;
      console.log(`Applying offset ${x} ${y}`)
      Array.from(textLayer).forEach(elm => {
        elm.style.marginLeft = x + "px";
        elm.style.marginTop = y + "px";
      });
    }

    const transcriptList = (await (await fetch(transcript)).text()).split('\n').map(line => JSON.parse(line));
    let tempTranscriptedText = [];

    // Text preprocessing once on change page number
    // Need to find out The page, the line, the word index for each word
    let line_index = 0;
    let word_index = 0;
    let last_page_index = 0;
    let last_line_index = 0;
    let last_word_index = 0;

    loop: // For each line of the file search through the page textlayer for the corresponding word
    for (let word of transcriptList) {
      for (let page_index = last_page_index; page_index < pages.length; page_index++) {
        for (const line of Array.from(pages[page_index].getElementsByTagName("span")).slice(last_line_index)) {
          for (const w of line.textContent.split(" ").slice(last_word_index)) {
            // Compare words ignoring special characters, case and thresholding similarity
            if (stringSimilarity.compareTwoStrings(simplifyString(word.value), simplifyString(w)) >= MIN_SIMILARITY) {
              tempTranscriptedText.push({time: word.time, value: w, line_index, page_index, word_index, line: line});
              last_word_index++;
              word_index++;
              // Once a word is found, nothing behind it will be matched, only forward
              last_line_index = line_index > last_line_index ? line_index : last_line_index;
              last_page_index = page_index > last_page_index ? page_index : last_page_index;
              continue loop;
            }
            word_index++;
          }
          word_index = 0;
          last_word_index = 0;
          line_index++;
        }
        line_index = 0;
        last_line_index = 0;
      }
      last_page_index++;
    }
    // The goal is to have an array like: [{time:, value:, page_index:, line_index:, word_index:, line:} ,... ]
    // console.log(tempTranscriptedText);
    if (tempTranscriptedText.length > 0) {
      setTranscriptedText(tempTranscriptedText);
      setTranscriptIndex(0);
      scrollToHighlight()
    }
  }, [pagesRendered]);


  // Scroll when line changes
  useEffect(() => scrollToHighlight(), [lastLine]);

  // Player functions 
  function getPlayerTime() {
    return audioPlayer?.current?.audio.current.currentTime;
  }

  function setPlayerTime(time) {
    if (audioPlayer?.current?.audio === undefined) return;
    audioPlayer.current.audio.current.currentTime = time;
  }

  function onAudioUpdate(e, reset = true) {
    const time = getPlayerTime();
    if (time === undefined)
      return;

    //Find word to highlight  [{time:, value:, page_index:, line_index:, word_index:,} ,... ]
    if (reset || transcriptIndex + MAX_DISTANCE > transcriptedText.length - 1) {
      transcriptedText.every((wordItem, index) => {
        if (wordItem.time >= time * 1000 - WORD_THRESHOLD) {
          // Update index and highlight and break out of loop
          setTranscriptIndex(index);
          return false;
        }
        return true;
      });
      // Enforce highlighting all words
    } else if (transcriptedText[transcriptIndex + 1].time - WORD_THRESHOLD <= time * 1000) {
      if (transcriptedText[transcriptIndex + MAX_DISTANCE].time <= time * 1000) {
        setTranscriptIndex(transcriptIndex + MAX_DISTANCE);
      }
      else
        setTranscriptIndex(transcriptIndex + 1);
    }

    //Scroll if line changed
    const wordItem = transcriptedText[transcriptIndex];
    if (wordItem) {
      if (lastLine !== {page: wordItem.page_index, line: wordItem.line_index})
        setLastLine({page: wordItem.page_index, line: wordItem.line_index});
    }

    // Keep player focused for shortcuts
    document.getElementsByClassName("audio-player")[0].focus();
  }

  function onWordClidk(wordItem) {
    if (wordItem)
      setPlayerTime(wordItem.time / 1000);
  }

  // TEXT RENDER
  // Add highliting: Edit lines adding marks around the word to highlight
  function makeTextRenderer(w_index) {
    return (textItem) => {
      //console.debug(`page ${textItem.page._pageIndex} item: ${textItem.itemIndex}: ${textItem.str}`);
      const page_index = textItem.page._pageIndex;
      const line_index = textItem.itemIndex;
      const splitText = textItem.str.split(" ");

      // Loop on every word of the line
      let skip = false;
      return splitText.reduce((arr, element, index) => {
        if (skip) {
          skip = false;
          return arr;
        }

        let transcript_index;

        // Find word to process
        transcriptedText.every((wordItem, windex) => {
          if (wordItem.line_index === line_index && wordItem.page_index === page_index && wordItem.word_index === index) {
            transcript_index = windex;
            return false;
          }
          return true;
        });

        const prevWordItem = Object.assign({}, transcriptedText[transcript_index - 1]);
        const wordItem = Object.assign({}, transcriptedText[transcript_index]);
        const nextWordItem = transcriptedText[transcript_index + 1];

        // If we are on a word to highlight
        // create highlight
        if (transcript_index === transcriptIndex) {
          // check if next is within MAX_DELAY_BETWEEN_WORDS
          if (wordItem && nextWordItem && wordItem.word_index < splitText.length - 2 && wordItem.time + playerSpeed * MAX_DELAY_BETWEEN_WORDS >= nextWordItem.time) {
            skip = true;
            wordItem.value += " " + nextWordItem.value;
          }
          // Or if the previous was
          else if (wordItem && prevWordItem && wordItem.word_index > 0 && wordItem.time - playerSpeed * MAX_DELAY_BETWEEN_WORDS <= prevWordItem.time) {
            wordItem.value = prevWordItem.value + " " + wordItem.value;
            arr = arr.slice(0, -2);
          }
          if (wordItem.word_index === index && index === 0)
            return [...arr, <mark key={'mark_' + index} className="wordHighlight">{wordItem.value} </mark>];
          else if (wordItem.word_index === index && index === splitText.length - 1)
            return [...arr, <mark key={'mark_' + index} className="wordHighlight"> {wordItem.value}</mark>];
          else if (wordItem.word_index === index)
            return [...arr, <mark key={'mark_' + index} className="wordHighlight"> {wordItem.value} </mark>];
        }

        // Else just add click elements
        const elm = <a style={{color: "transparent"}} href="#" onClick={e => onWordClidk(wordItem)}>{element}</a>;

        if (index > 0 && arr.slice(-1)[0].type === "a")
          return [...arr, " ", elm];
        else
          return [...arr, elm];
      }, []);
    };
  }

  // Change player speed
  useEffect(() => {
    if (audioPlayer?.current?.audio === undefined) return;
    audioPlayer.current.audio.current.playbackRate = playerSpeed;
    document.getElementsByClassName("audio-player")[0].focus()
  }, [playerSpeed]);

  function onDocumentLoadSuccess({numPages}) {
    setNumPages(numPages);
    //focus audio player for shortcuts
    document.getElementsByClassName("audio-player")[0].focus()
  }

  return (
    <div className="App">
      <div className="top">
        <div className="player">
          <h4 className="titlebar">PDF Reader</h4>
          <AudioPlayer
            className="audio-player"
            //autoPlay //Maybe you want this?
            ref={audioPlayer}
            listenInterval={LISTEN_INTERVAL}
            src={audio}
            onPlay={onAudioUpdate}
            onPause={onAudioUpdate}
            onSeeked={onAudioUpdate}
            onEnded={onAudioUpdate}
            onListen={(e) => onAudioUpdate(e, !FORCE_ALL_WORDS_HIGHLIGHT)}

            // UI props: remove loop button, add speed control
            customAdditionalControls={[
              <div style={{position: "absolute", marginTop: "1.5em", marginLeft: "-1.5em"}} >
                <div>
                  {/* <label className="center" >speed</label> */}
                </div>
                <button onClick={() => setPlayerSpeed(clamp(playerSpeed - PLAYER_SPEED_STEP))}
                  style={{background: "transparent", border: "transparent", cursor: "pointer"}}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" focusable="false" width="2em" height="1em"
                    preserveAspectRatio="xMidYMid meet" viewBox="4 6 36 16"
                    className="rightArrow"
                    style={{background: "transparent", border: "transparent"}}>
                    <path d="M13 6v12l8.5-6M4 18l8.5-6L4 6v12z" fill="currentColor"></path>
                  </svg>
                </button>
                <label>{playerSpeed.toFixed(2)}</label>
                <button onClick={() => setPlayerSpeed(clamp(playerSpeed + PLAYER_SPEED_STEP))}
                  style={{background: "transparent", border: "transparent", cursor: "pointer"}}>
                  <svg xmlns="http://www.w3.org/2000/svg" focusable="false" width="2em" height="1em"
                    preserveAspectRatio="xMidYMid meet" viewBox="4 3 36 16" >
                    <path d="M13 6v12l8.5-6M4 18l8.5-6L4 6v12z" fill="currentColor"></path>
                  </svg>
                </button>
              </div>
            ]}
            // Jump 1 seconds
            progressJumpSteps={{backward: 1000 * PLAYER_STEP_SIZE, forward: 1000 * PLAYER_STEP_SIZE}}
          />
        </div>
      </div>

      <Document
        file={pdfFile}
        onLoadSuccess={onDocumentLoadSuccess}
        options={options}
        onItemClick={({pageNumber}) => alert('Clicked an item from page ' + pageNumber + '!')}
      >
        {
          // Loop adding pages
          Array.from(
            new Array(numPages),
            (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                scale={.8}
                width={size.x}
                onRenderSuccess={() => setPagesRendered(pagesRendered + 1)}
                customTextRenderer={makeTextRenderer(transcriptIndex)}
              />
            ),
          )
        }
      </Document>
    </div>
  );
}

export default App;
