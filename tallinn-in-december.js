const easymidi = require("easymidi");
const axios = require("axios");
const { Note, Scale } = require("@tonaljs/tonal");

const OPENWEATHERMAP_API_KEY = process.env.API_KEY;
const WEATHER_URL = "https://api.openweathermap.org/data/2.5/onecall";
const LATITUDE = parseFloat(process.env.LATITUDE);
const LONGITUDE = parseFloat(process.env.LONGITUDE);

const MIDI_CLOCK_PER_QUARTER_NOTE = 24; // From MIDI specification:
const MASTER_TEMPO = 40; // BPM = number of quarter notes per minute

const virtualInput = new easymidi.Input("Node.js input", true);
const virtualOutput = new easymidi.Output("Node.js output", true);

/**
 * Get the weather for the given location.
 *
 * @param {number} lat - The latitude of the location.
 * @param {number} lon - The longitude of the location.
 * @param {Object} config - The configuration for the request.
 * @returns {Object} The weather data.
 */
async function getCurrentWeather(lat, lon, config = {}) {
  const { apiKey, apiUrl } = config;
  const reqUrl = `${apiUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

  try {
    const response = await axios.get(reqUrl);
    return response.data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Convert the temperature from weather data into musical notes.
 *
 * @param {Object} weather - The weather data.
 * @param {Object} tone - The Tone.js object.
 * @returns {Object} The musical notes.
 */
function mappingTemperatureDataIntoNotes(weather) {
  const { current, hourly, daily } = weather;
  const temperatureToNotesMultiplier = Math.floor(Math.random() * 99) + 1;
  const musicalRange = Scale.rangeOf("C pentatonic");
  const musicalScale = musicalRange("C3", "C6");

  const frequencies = musicalScale.map((note) => {
    return {
      note,
      frequency: Note.freq(note),
    };
  });

  const findCloserFrequency = (givenValue, frequencyList) => {
    const closestFrequency = frequencyList.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.frequency - givenValue);
      const currDiff = Math.abs(curr.frequency - givenValue);
      return prevDiff < currDiff ? prev : curr;
    });
    return closestFrequency.note;
  };

  const currentTemperature =
    Math.abs(current.temp) * temperatureToNotesMultiplier;

  const hourlyTemperature = hourly.map((hour) => {
    return Math.abs(hour.temp) * temperatureToNotesMultiplier;
  });

  const dailyTemperature = daily.map((day) => {
    return Math.abs(day.temp.day) * temperatureToNotesMultiplier;
  });

  return {
    lead: findCloserFrequency(currentTemperature, frequencies),
    melody1: hourlyTemperature.map((temperature) => {
      return findCloserFrequency(temperature, frequencies);
    }),
    melody2: dailyTemperature.map((temperature) => {
      return findCloserFrequency(temperature, frequencies);
    }),
  };
}

/**
 * Randomize an integer between min and max.
 * @param {Int} min
 * @param {Int} max
 * @returns
 */
function getRandomInt(min, max) {
  const minimum = Math.ceil(min);
  const maximum = max = Math.floor(max);
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

async function main() {
  let weather = await getCurrentWeather(LATITUDE, LONGITUDE, {
    apiKey: OPENWEATHERMAP_API_KEY,
    apiUrl: WEATHER_URL,
  });

  let notesData = mappingTemperatureDataIntoNotes(weather);

  let melodyLength1 = notesData.melody1.length;
  let index1 = 0;

  const basePad = notesData.lead;

  let totalClockPerMinute = MIDI_CLOCK_PER_QUARTER_NOTE * MASTER_TEMPO;
  let clockCounting = 1;

  virtualInput.on("start", () => {
    // The pad sound as a base layer
    virtualOutput.send("noteon", {
      note: Note.midi(basePad),
      velocity: 127,
      channel: 2,
    });
  });

  virtualInput.on("stop", () => {
    // The pad sound as a base layer
    virtualOutput.send("noteoff", {
      note: Note.midi(basePad),
      velocity: 0,
      channel: 2,
    });  
  });

  virtualInput.on("clock", () => {
    if (clockCounting === totalClockPerMinute) {
      // Reset the counter
      clockCounting = 1;
    }

    if (index1 === melodyLength1) {
      // The melody is over, do something
      notesData = mappingTemperatureDataIntoNotes(weather);
      melodyLength1 = notesData.melody1.length;
      index1 = 0;
    }

    if (clockCounting %  (MIDI_CLOCK_PER_QUARTER_NOTE * 2) === 0) {
      // Note is off
      virtualOutput.send("noteoff", {
        note: Note.midi(notesData.melody1[index1]),
        velocity: 0,
        channel: 1,
      });
    }

    if (clockCounting %  (MIDI_CLOCK_PER_QUARTER_NOTE * 2) === 1) {
      // Note is on
      virtualOutput.send("noteon", {
        note: Note.midi(notesData.melody1[index1]),
        velocity: getRandomInt(100, 127),
        channel: 1,
      });
      index1++;
    }

    clockCounting++;
  });
}

main();
