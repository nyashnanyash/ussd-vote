const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Use session middleware to store temporary session data
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

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
                // Fetch candidates from the database
                db.query('SELECT candidate_id, candidate_name FROM candidates', (err, results) => {
                    if (err) {
                        console.error('Error fetching candidates from database:', err.stack);
                        response = userLanguages[phoneNumber] === 'en' ? 
                            `END Error fetching candidates. Please try again later.` : 
                            `END Hari ikibazo cyo gufata amakandida. Ongera mugerageze nyuma.`;
                        res.send(response);
                    } else {
                        if (results.length > 0) {
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `CON Select a candidate:\n` : 
                                `CON Hitamo umukandida:\n`;

                            results.forEach((candidate, index) => {
                                response += `${index + 1}. ${candidate.candidate_name}\n`;
                            });

                            // Store the fetched candidates in a temporary in-memory storage for the session
                            req.session.candidates = results;
                        } else {
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `END No candidates available.` : 
                                `END Nta mukandida uboneka.`;
                        }
                        res.send(response);
                    }
                });
                return; // Return early to wait for database response
            }
        } else if (userInput[1] === '2') {
            // View votes option selected
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Votes:\n` : 
                `END Amajwi:\n`;

            // Fetch vote counts from the database
            db.query('SELECT candidates.candidate_name, COUNT(votes.voted_candidate) as votes FROM votes JOIN candidates ON votes.voted_candidate = candidates.candidate_id GROUP BY votes.voted_candidate', (err, results) => {
                if (err) {
                    console.error('Error fetching votes from database:', err.stack);
                    response += userLanguages[phoneNumber] === 'en' ? 
                        `Error fetching votes. Please try again later.` : 
                        `Hari ikibazo cyo gufata amajwi. Ongera mugerageze nyuma.`;
                } else {
                    results.forEach(row => {
                        response += `${row.candidate_name}: ${row.votes} votes\n`;
                    });
                }
                res.send(response);
            });
            return; // Return early to wait for database response
        }
    } else if (userInput.length === 3) {
        // Voting confirmation
        let candidateIndex = parseInt(userInput[2]) - 1;
        let candidates = req.session.candidates;

        if (candidateIndex >= 0 && candidateIndex < candidates.length) {
            let selectedCandidate = candidates[candidateIndex];
            voters.add(phoneNumber); // Mark this phone number as having voted
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Thank you for voting for ${selectedCandidate.candidate_name}!` : 
                `END Murakoze gutora ${selectedCandidate.candidate_name}!`;

            // Insert voting record into the database
            const voteData = {
                session_id: sessionId,
                phone_number: phoneNumber,
                language_used: userLanguages[phoneNumber],
                voted_candidate: selectedCandidate.candidate_id
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
