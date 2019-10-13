const Trello = require("trello");
const fs = require("fs");

const setupFilePath = "./setup.js";

try {
  if (!fs.existsSync(setupFilePath)) {
    console.log(`To use this app, you will need to create a ./setup.js file with the following data :

    const API_TOKEN = ""
    const API_KEY = "";
    const TRELLO_BOARD_ID = "";

    module.exports = {
      API_TOKEN,
      API_KEY,
      TRELLO_BOARD_ID
    };


    ------------------------
    On this website : https://trello.com/app-key
    You will find 
    -> "Key" section to fill "API_KEY"
    -> Click on "you can manually generate a Token" to generate the "API_TOKEN"

    To get your board id, go to your board on trello website,
    -> look at the url "https://trello.com/b/board_id/board_name"
    -> "board_id" => "TRELLO_BOARD_ID"
`);
    process.exit();
  }
} catch (err) {
  console.error(err);
}

const setup = require(setupFilePath);
const trello = new Trello(setup.API_KEY, setup.API_TOKEN);

const getSprintLists = async sprintNumber => {
  let response;
  try {
    allLists = await trello.getListsOnBoard(setup.TRELLO_BOARD_ID);
    return allLists.filter(list => list.name.includes(sprintNumber));
  } catch (error) {
    if (error) {
      console.log("error ", error);
    }
  }
};

const cardPointsExtractor = card => {
  if (!card) return 0;
  const cardName = card.name;
  const cardPoints = cardName.match(/^\(([0-9]*)\)/);
  return cardPoints.length > 1 ? parseInt(cardPoints[1], 10) : 0;
};

const getCardsFromLists = async targetLists => {
  const cards = await Promise.all(
    targetLists.map(async list => {
      const cards = await trello.getCardsOnList(list.id);
      return cards;
    })
  );
  return cards.reduce((acc, curr) => acc.concat(curr), []);
};

const addLabelsToCards = async cards => {
  return await Promise.all(
    cards.map(async card => {
      const cardPoints = await cardPointsExtractor(card);
      const cardWithPointAndLabels = {
        labels: card.idLabels,
        points: cardPoints
      };
      return cardWithPointAndLabels;
    })
  );
};

const convertCardListInLabelList = allcardsWithPointAndLabels => {
  return allcardsWithPointAndLabels.reduce((accumulator, labelsWithPoints) => {
    labelsWithPoints.labels.forEach(label =>
      accumulator.push({ label: label, points: labelsWithPoints.points })
    );
    return accumulator;
  }, []);
};

const mergeDuplicateLabels = allLabelsAndPoints => {
  return allLabelsAndPoints.reduce((accumulator, labelAndPoints) => {
    const indexOfCurrentLabel = accumulator.findIndex(
      currentLabelWithPoints =>
        currentLabelWithPoints.label === labelAndPoints.label
    );

    if (indexOfCurrentLabel === -1) {
      accumulator.push({
        label: labelAndPoints.label,
        points: 0
      });
    }
    accumulator.forEach(currentLabelWithPoints => {
      if (currentLabelWithPoints.label === labelAndPoints.label) {
        currentLabelWithPoints.points += labelAndPoints.points;
      }
    });
    return accumulator;
  }, []);
};

const convertTagIdInTagName = async allLabelsFilteredAndPoints => {
  const boardTags = await trello.getLabelsForBoard(setup.TRELLO_BOARD_ID);

  return await Promise.all(
    allLabelsFilteredAndPoints.map(labelAndPoints => {
      const linkedTag = boardTags.find(
        boardTag => boardTag.id === labelAndPoints.label
      );

      if (!linkedTag)
        return {
          points: labelAndPoints.points,
          labelName: `Tag non trouvé : ${labelAndPoints.labelId}`
        };

      return { points: labelAndPoints.points, labelName: linkedTag.name };
    })
  );
};

const extractor = async sprintNumber => {
  const targetLists = await getSprintLists(sprintNumber);
  const allCards = await getCardsFromLists(targetLists);
  const allcardsWithPointAndLabels = await addLabelsToCards(allCards);
  const allLabelsAndPoints = convertCardListInLabelList(
    allcardsWithPointAndLabels
  );
  const allLabelsFilteredAndPoints = mergeDuplicateLabels(allLabelsAndPoints);
  const allLabelNameWithPoints = await convertTagIdInTagName(
    allLabelsFilteredAndPoints
  );

  return allLabelNameWithPoints.sort((a, b) => a.points > b.points);
};

// Get process.stdin as the standard input object.
var standard_input = process.stdin;

// Set input character encoding.
standard_input.setEncoding("utf-8");

// Prompt user to input data in console.
console.log("Please enter sprint number");

// When user input data and click enter key.
standard_input.on("data", async function(data) {
  // User input exit.
  if (data === "exit\n") {
    // Program exit.
    console.log("User input complete, program exit.");
    process.exit();
  } else {
    const sprintNumber = data.trim();
    try {
      const sprintLabelsWithPoints = await extractor(sprintNumber);
      console.table(sprintLabelsWithPoints);
    } catch (error) {
      console.log(error);
    } finally {
      process.exit();
    }
  }
});
