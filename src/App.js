import React, {useEffect, createRef, useRef, useMemo, useState} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

//Stylesheet
import './index.css';

// This is just for testing, those variables will be deleted later and their references refactored
import IpdfFile from './examples/colibosco.pdf';
import Iaudio from './examples/colibosco.mp3';
import Itranscript from './examples/colibosco.txt';
////////////////////////////////////////////////////////////////

// Adjustments
const LISTEN_INTERVAL = 30; // ms, Highlight update interval. Too low might cause high cpu usage.
const MIN_SIMILARITY = .8; // Set to 1 to only accept exact matches. 
const WORD_THRESHOLD = 30; // ms
const FORCE_ALL_WORDS_HIGHLIGHT = 1; // Forces all the words to be highlithed, but might increase latency
const MAX_DISTANCE = 2; // Do not allow more than MAX_DISTANCE words to delay if above is true


const options = {
  cMapUrl: `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};

// Used before comparing words from pdf to words in the transcript
function simplifyString(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/ig, '').toLowerCase();
}

function scrollToHighlight() {
  const el = document.getElementsByClassName('wordHighlight')[0]
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
  const [searchText, setSearchText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [pagesRendered, setPagesRendered] = useState(0);
  const [transcriptedText, setTranscriptedText] = useState([]);

  // Check for url params, if not example is loaded. This is ran only once.
  useEffect(() => {
    const urlParams = getQueryParams();
    if (urlParams.text && urlParams.audio && urlParams.pdf){
      setPdfFile(urlParams.pdf);
      setAudio(urlParams.audio);
      setTranscript(urlParams.text);
    }else {
      console.error("Params missing. Loading example file");
      setPdfFile(IpdfFile);
      setAudio(Iaudio);
      setTranscript(Itranscript);
    }
  }, []);

  //Load transcript
  useEffect(async () => {
    if(transcript==='')
      return
    const pages = document.getElementsByClassName("react-pdf__Page")
    if (pagesRendered != pages.length)
      return
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
              tempTranscriptedText.push({time: word.time, value: w, line_index, page_index, word_index});
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
    // The goal is to have an array like: [{time:, value:, page_index:, line_index:, word_index:,} ,... ]
    // console.log(tempTranscriptedText);
    if (tempTranscriptedText.length > 0) {
      setTranscriptedText(tempTranscriptedText);
      scrollToHighlight()
    }
  }, [pagesRendered]);


  function highlightPattern(textItem, highlightWordIndex) {
    //Returns text with marks so that it can be highlighted. 
    //console.debug(`page ${textItem.page._pageIndex} item: ${textItem.itemIndex}: ${textItem.str}`);
    const text = textItem.str;

    // Word highlights
    // [{time:, value:, page_index:, line_index:, word_index:,} ,... ]
    const wordItem = transcriptedText[highlightWordIndex];
    if (wordItem && wordItem.line_index === textItem.itemIndex && wordItem.page_index === textItem.page._pageIndex) {
      const splitText = text.split(" ");
      const highlights = splitText.reduce((arr, element, index) => (wordItem.word_index === index ? [
        ...arr,
        <mark key={index} className="wordHighlight">
          {wordItem.value + " "}
        </mark>,
      ] : [...arr, element + " "]), []);
      return highlights;
    }
    return text;
  }

  const textRenderer = wordIndex => textItem => highlightPattern(textItem, wordIndex);
  const audioPlayer = createRef();

  function getPlayerTime() {
    return audioPlayer?.current?.audio.current.currentTime;
  }

  function onAudioUpdate(e, reset = true) {
    const time = getPlayerTime();
    if(time === undefined)
      return;

    //Find word to highlight  [{time:, value:, page_index:, line_index:, word_index:,} ,... ]
    if (reset){
      transcriptedText.every((wordItem, index) => {
        if (wordItem.time >= time * 1000 - WORD_THRESHOLD) {
          // Update index and highlight and break out of loop
          setWordIndex(index);
          // Scroll to line
          scrollToHighlight()
          return false;
        }
        return true;
      });
    // Enforce highlighting all words
    } else if(transcriptedText[wordIndex+1].time <= time * 1000){
      if(transcriptedText[wordIndex+MAX_DISTANCE].time <= time * 1000)
        setWordIndex(wordIndex+MAX_DISTANCE);
      else
        setWordIndex(wordIndex+1);
      scrollToHighlight()
    }

    // Keep player focused for shortcuts
    document.getElementsByClassName("audio-player")[0].focus()
  }

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

            // UI props: remove loop button
            customAdditionalControls={[]}
          />
        </div>
        {/*Experimental search bar. User as inspiration for another widgets*/}
        {/* <div className="searchBar"> */}
        {/*   <label htmlFor="search">Search: </label> */}
        {/*   <input type="search" id="search" value={searchText} onChange={onTextSearch} onKeyUp={onTextSearchSeek} /> */}
        {/* </div> */}
      </div>

      <Document
        file={pdfFile}
        onLoadSuccess={onDocumentLoadSuccess}
        options={options}
      >
        {
          // Loop adding pages
          Array.from(
            new Array(numPages),
            (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                onRenderSuccess={() => setPagesRendered(pagesRendered + 1)}
                customTextRenderer={textRenderer(wordIndex)}
              />
            ),
          )
        }
      </Document>
    </div>
  );
}

export default App;

