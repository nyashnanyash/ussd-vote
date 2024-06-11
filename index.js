const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Database connection details
const dbConfig = {
    host: 'b9tke7zb9kqjyne8usvk-mysql.services.clever-cloud.com',
    user: 'urrvvqyhyactvrtn',
    password: 'yDuJ1vA3gOocQ73lkrZe', // Replace with your MySQL password
    database: 'b9tke7zb9kqjyne8usvk'
};

let db;

// Function to handle connection
function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.error('Error connecting to database:', err.stack);
            setTimeout(handleDisconnect, 2000); // Reconnect after 2 seconds
        } else {
            console.log('Connected to database.');
        }
    });

    db.on('error', err => {
        console.error('Database error:', err.stack);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // Reconnect on connection loss
        } else {
            throw err;
        }
    });
}

// Initial connection
handleDisconnect();

// In-memory storage for votes (for simplicity)
let votes = {
    "Didier MUTABAZI": 0,
    "Florence UMUTONIWASE": 0,
    "Jean Paul KWIBUKA": 0,
    "Gaella UWAYO": 0,
    "Danny HABIMANA": 0
};

// In-memory storage for user data (for simplicity)
let voters = new Set(); // Set to track phone numbers that have already voted
let userLanguages = {}; // Object to store the language preference of each user

app.post('/ussd', (req, res) => {
    let response = '';

    // Extract USSD input
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Parse user input
    const userInput = text.split('*').map(option => option.trim());

    // Determine next action based on user input
    if (userInput.length === 1 && userInput[0] === '') {
        // First level menu: Language selection
        response = `CON Guild Voting\n`;
        response += `1. English\n`;
        response += `2. Kinyarwanda`;
    } else if (userInput.length === 1 && userInput[0] !== '') {
        // Save user's language choice and move to the main menu
        userLanguages[phoneNumber] = userInput[0] === '1' ? 'en' : 'rw';
        response = userLanguages[phoneNumber] === 'en' ? 
            `CON Choose an option:\n1. Vote Candidate\n2. View Votes` : 
            `CON Hitamo:\n1. Tora umukandida\n2. Reba amajwi`;
    } else if (userInput.length === 2) {
        if (userInput[1] === '1') {
            // Check if the phone number has already voted
            if (voters.has(phoneNumber)) {
                response = userLanguages[phoneNumber] === 'en' ? 
                    `END You have already voted. Thank you!` : 
                    `END Waratoye. Murakoze!`;
            } else {
                // Voting option selected
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Select a candidate:\n1. Didier MUTABAZI\n2. Florence UMUTONIWASE\n3. Jean Paul KWIBUKA\n4. Gaella UWAYO\n5. Danny HABIMANA` : 
                    `CON Hitamo umukandida:\n1. Didier MUTABAZI\n2. Florence UMUTONIWASE\n3. Jean Paul KWIBUKA\n4. Gaella UWAYO\n5. Danny HABIMANA`;
            }
        } else if (userInput[1] === '2') {
            // View votes option selected
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Votes:\n` : 
                `END Amajwi:\n`;
            for (let candidate in votes) {
                response += `${candidate}: ${votes[candidate]} votes\n`;
            }
        }
    } else if (userInput.length === 3) {
        // Voting confirmation
        let candidateIndex = parseInt(userInput[2]) - 1;
        let candidateNames = Object.keys(votes);
        if (candidateIndex >= 0 && candidateIndex < candidateNames.length) {
            votes[candidateNames[candidateIndex]] += 1;
            voters.add(phoneNumber); // Mark this phone number as having voted
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Thank you for voting for ${candidateNames[candidateIndex]}!` : 
                `END Murakoze gutora ${candidateNames[candidateIndex]}!`;

            // Insert voting record into the database
            const voteData = {
                session_id: sessionId,
                phone_number: phoneNumber,
                language_used: userLanguages[phoneNumber],
                voted_candidate: candidateNames[candidateIndex]
            };

            const query = 'INSERT INTO votes SET ?';
            db.query(query, voteData, (err, result) => {
                if (err) {
                    console.error('Error inserting data into database:', err.stack);
                }
            });
        } else {
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Invalid selection. Please try again.` : 
                `END Hitamo idakwiye. Ongera mugerageze.`;
        }
    }

    res.send(response);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
