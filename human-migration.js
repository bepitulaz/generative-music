const csv = require("csv-parser");
const fs = require("fs");
const easymidi = require("easymidi");
const { Note, Scale } = require("@tonaljs/tonal");

const result = [];

const MIDI_CLOCK_PER_QUARTER_NOTE = 24; // From MIDI specification:
const MASTER_TEMPO = 64; // BPM = number of quarter notes per minute
const IS_SIMULATION = false;

fs.createReadStream("tk1423-adsb.csv")
  .pipe(csv({ separator: ";" }))
  .on("data", (data) => result.push(data))
  .on("end", () => {
    const parsedFlightData = result.map((data) => ({
      altitude: data["metres"] ? parseInt(data["metres"]) : 0,
      speed: data["mph"] ? parseInt(data["mph"]) : 0,
    }));
    main(parsedFlightData);
  });

/**
 * Randomize an integer between min and max.
 * @param {Int} min
 * @param {Int} max
 * @returns
 */
function getRandomInt(min, max) {
  const minimum = Math.ceil(min);
  const maximum = (max = Math.floor(max));
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

/**
 * Use this function to simulate the sequencer, and debug the musical notes.
 *
 * @param {Object} data - flight data
 * @param {Array} scale - musical scale
 */
function sequencerSimulation(data, scale) {
  let speedDifference = 0;
  let previousSpeed = 0;
  let isSpeedNoteChanged = false;
  let previousSpeedNote = "";

  let altitudeDifference = 0;
  let previousAltitude = 0;
  let isAltitudeNoteChanged = false;
  let previousAltitudeNote = "";

  data.forEach((flight) => {
    if (flight.speed > scale.length) {
      // Because the speed data is too high, let's do a creative stuff
      // to make it fit on a scale length.
      const remainder = flight.speed % scale.length;
      speedDifference = remainder;
    } else {
      speedDifference = flight.speed - previousSpeed;
    }

    if (flight.altitude > scale.length) {
      // Because the altitude data is too high, let's do a creative stuff
      // to make it fit on a scale length.
      const remainder = flight.altitude % scale.length;
      altitudeDifference = remainder;
    } else {
      altitudeDifference = flight.altitude - previousAltitude;
    }

    const currentSpeedNote = scale[speedDifference] ?? previousSpeedNote;
    const currentAltitudeNote =
      scale[altitudeDifference] ?? previousAltitudeNote;

    if (flight.speed === previousSpeed && !isSpeedNoteChanged) {
      console.log(`${currentSpeedNote} is not changed`);
    } else {
      isSpeedNoteChanged = true;
      console.log("---");
      console.log(`${previousSpeedNote} retard`);
      console.log(`${currentSpeedNote} advance`);
      console.log("---");
    }

    if (flight.altitude === previousAltitude && !isAltitudeNoteChanged) {
      console.log(`${currentAltitudeNote} is not changed`);
    } else {
      isSpeedNoteChanged = true;
      console.log("---");
      console.log(`${previousAltitudeNote} retard`);
      console.log(`${currentAltitudeNote} advance`);
      console.log("---");
    }

    previousSpeed = flight.speed;
    previousSpeedNote = currentSpeedNote;
    previousAltitude = flight.altitude;
    previousAltitudeNote = currentAltitudeNote;
  });
}

/**
 * The sequencer for Ableton Live. It synchronizes the notes with the MIDI clock.
 * @param {Object} data - flight data
 * @param {Array} scale - musical scale
 */
function sequencerAbleton(data, scale) {
  const virtualInput = new easymidi.Input("Node.js input", true);
  const virtualOutput = new easymidi.Output("Node.js output", true);

  let speedDifference = 0;
  let previousSpeed = 0;
  let isSpeedNoteChanged = false;
  let previousSpeedNote = "";

  let altitudeDifference = 0;
  let previousAltitude = 0;
  let isAltitudeNoteChanged = false;
  let previousAltitudeNote = "";

  let totalClockPerMinute = MIDI_CLOCK_PER_QUARTER_NOTE * MASTER_TEMPO;
  let clockCounting = 1;
  let dataIndex = 0;

  virtualInput.on("clock", () => {
    if (clockCounting === totalClockPerMinute) {
      // Reset the clock counter
      clockCounting = 1;
    }

    if (dataIndex === data.length - 1) {
      // Stop the sequencer
      virtualOutput.send("stop");
    }

    // DO THE CALCULATION FOR EACH BEAT ONLY
    if (clockCounting % MIDI_CLOCK_PER_QUARTER_NOTE === 0) {
      if (data[dataIndex].speed > scale.length) {
        // Because the speed data is too high, let's do a creative stuff
        // to make it fit on a music scale length.
        const remainder = data[dataIndex].speed % scale.length;
        speedDifference = remainder;
      } else {
        speedDifference = data[dataIndex].speed - previousSpeed;
      }

      if (data[dataIndex].altitude > scale.length) {
        // Because the altitude data is too high, let's do a creative stuff
        // to make it fit on a music scale length.
        const remainder = data[dataIndex].altitude % scale.length;
        altitudeDifference = remainder;
      } else {
        altitudeDifference = data[dataIndex].altitude - previousAltitude;
      }

      const currentSpeedNote = scale[speedDifference] ?? previousSpeedNote;
      const currentAltitudeNote =
        scale[altitudeDifference] ?? previousAltitudeNote;

      if (data[dataIndex].speed === previousSpeed && !isSpeedNoteChanged) {
        console.log(`Speed: ${currentSpeedNote} is not changed`);
      } else {
        isSpeedNoteChanged = true;
        
        virtualOutput.send("noteoff", {
          note: Note.midi(previousSpeedNote),
          velocity: 0,
          channel: 2,
        });

        virtualOutput.send("noteon", {
          note: Note.midi(currentSpeedNote),
          velocity: getRandomInt(100, 127),
          channel: 2,
        });
      }

      if (data[dataIndex].altitude === previousAltitude && !isAltitudeNoteChanged) {
        console.log(`Altitude: ${currentAltitudeNote} is not changed`);
      } else {
        isSpeedNoteChanged = true;
        
        virtualOutput.send("noteoff", {
          note: Note.midi(previousAltitudeNote),
          velocity: 0,
          channel: 1,
        });

        virtualOutput.send("noteon", {
          note: Note.midi(currentAltitudeNote),
          velocity: getRandomInt(100, 127),
          channel: 1,
        });
      }

      previousSpeed = data[dataIndex].speed;
      previousSpeedNote = currentSpeedNote;
      previousAltitude = data[dataIndex].altitude;
      previousAltitudeNote = currentAltitudeNote;

      dataIndex++;
    }

    clockCounting++;
  });
}

function main(flightData) {
  const musicalRange = Scale.rangeOf("A minor blues");
  const musicalScale = musicalRange("A3", "A6");

  if (IS_SIMULATION) {
    sequencerSimulation(flightData, musicalScale);
  } else {
    sequencerAbleton(flightData, musicalScale);
  }
}
