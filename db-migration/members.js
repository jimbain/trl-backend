const fs = require('fs');
const csv = require('csv-parser');

const inputFilePath =
  '/Users/rakib/Documents/Office/DevDec/TRL/trl_data/csv/members_biz.csv';

// Define an array to store processed rows
const results = [];

// Read the CSV file
fs.createReadStream(inputFilePath)
  .pipe(csv({ separator: '\t' })) // Tab-separated values
  .on('headers', (headers) => {
    console.log('Headers:', headers); // Optional: view headers if needed
  })
  .on('data', (row) => {
    // Ignore 'valid_to' and 'featured_to', set them to null
    row['valid_to'] = null;
    row['featured_to'] = null;

    // Push the row to results (you can replace this part with a DB insert)
    results.push(row);
  })
  .on('end', () => {
    // When the CSV reading is done, you can handle the results here
    console.log('Finished reading file. Processed rows:', results.length);

    // Example: Insert rows into a database (e.g., PostgreSQL) or other operation
    insertIntoDatabase(results); // Placeholder function
  })
  .on('error', (err) => {
    console.error('Error reading file:', err);
  });

// Placeholder function for inserting into a database
function insertIntoDatabase(rows) {
  // Example code: Insert the rows into a PostgreSQL DB
  // You can use a library like 'pg' to interact with PostgreSQL
  console.log('Inserting rows into the database...', rows);
  // Perform database insert operation here
}
