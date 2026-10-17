require('dotenv').config();
const express = require('express');
const axios = require("axios");
const { Parser } = require('@json2csv/plainjs');
const app = express()
const { SERVER_PORT, JIRA_URL, JIRA_EMAIL, JIRA_TOKEN } = process.env;

const USER_ACCOUNT_IDS = [
    { id: "712020:db32f8db-db6e-4a64-bc82-f82875d11af6", name: "Arslan Haroon" },
    { id: "712020:6af8e173-175c-463f-a78a-160c420b86b2", name: "Ahmad Ali" },
    { id: "712020:0959af9d-9886-4381-afa1-f790fc9ae2d9", name: "Usama Hadi" },
    { id: "712020:144c7f8d-d654-41dd-946d-4f9e8e89198c", name: "Ahsan Ali" },
    //
    { id: "712020:170bab30-a5f3-469a-9c70-3f046c7d0517", name: "Rahat Ali"},
    //
    { id: "712020:219040d3-9523-4d4d-8d30-c74f35487038", name: "Mudassir Rehman" },
    { id: "712020:2087b901-879f-47f8-9b02-d78c1f681bbd", name: "Mustehsan Ali" },
    { id: "712020:d058887b-e7d3-4ba6-a76d-2f2f7d098dd1", name: "Ali Zayan"},
    { id: "712020:4b9b36d5-479c-4ee3-a43c-662b50d7ec52", name: "Irsa Riaz"},
    { id: "712020:886f499b-45ff-42b4-bba5-a3a281f162dd", name: "Ali Mehroz"},
    //
    { id: "712020:29c3cd8b-6095-4f56-b596-a77f1b2ce61c", name: "Samar Shehzad"},
    //
    { id: "712020:04ab0193-0da1-4825-bf7b-6a383599af0b", name: "Maryam Fizza" },
    { id: "712020:c4f6b183-0fe7-4d7e-a94d-13ed30712321", name: "Mubashar Ahmed" },
    //
    // //QA Team
    { id: "712020:a119abcf-325c-425f-acd6-daeb0723ae89", name: "Eshrat Ul Islam" },
    { id: "712020:573762a0-bedd-45b8-baee-ed80c901b741", name: "Muhammad Usman Waheed" },
    { id: "712020:a6845d24-7d3b-49c0-a2f8-b7086c1cdf39", name: "Taha Ammar" },
];

const jira = axios.create({
    baseURL: `${JIRA_URL}/rest/api/3`,
    auth: {
        username: JIRA_EMAIL,
        password: JIRA_TOKEN,
    },
    headers: {
        "Accept": "application/json",
    },
});

function extractTextFromADF(node) {
    if (!node) return '';

    if (node.type === 'text' && node.text) {
        return node.text;
    }

    if (Array.isArray(node.content)) {
        const childTexts = node.content.map(extractTextFromADF);

        if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'bulletList' || node.type === 'orderedList') {
            return childTexts.join('') + '\n';
        }
        if (node.type === 'listItem') {
            return '• ' + childTexts.join('');
        }
        return childTexts.join('');
    }
    return '';
}

async function getWorklogsForUser(user, start, end) {
    const jql = `worklogAuthor=${user.id} AND worklogDate >= "${start}" AND worklogDate <= "${end}"`;

    const response = await jira.get("/search/jql", {
        params: {
            jql,
            fields: "key,summary,description,project,issuetype,status,worklog",
            maxResults: 100
        }
    });

    let rows = [];
    for (const issue of response.data.issues) {
        const worklogs = await getAllWorklogs(issue.key);

        //if (!issue.fields.worklog) return;

        worklogs.forEach(wl => {
            if (wl.author.accountId !== user.id) return;
            const started = new Date(wl.started);
            const date = started.toLocaleString("en-CA", {
                timeZone: "Asia/Karachi"
            }).split(",")[0];

            const hours = wl.timeSpentSeconds / 3600;

            rows.push({
                'Author': user.name || 'N/A',
                'Project Key': issue.fields.project.key,
                //'Date': date,
                //'Hours': hours.toFixed(2),
                //'Issue Key': issue.key,
                'Title': (issue.fields.summary || "").replace(/,/g, " "),
                'Comment': extractTextFromADF(wl.comment)
                //'Type': issue.fields.issuetype.name,
                //'Status': issue.fields.status.name,
            });
        });
    };
    return rows;
}

async function getAllWorklogs(issueKey) {
    let startAt = 0;
    let all = [];

    while (true) {
        const res = await jira.get(`/issue/${issueKey}/worklog`, {
            params: { startAt, maxResults: 100 }
        });

        all.push(...res.data.worklogs);

        if (startAt + res.data.maxResults >= res.data.total) break;
        startAt += res.data.maxResults;

        await sleep(150); // avoid rate limit
    }

    return all;
}


app.get('/', async (req, res) => {
    let {start, end} = req.query;
    if(!start) start = new Date().toISOString().split('T')[0].toString()
    if (!end) end = start;

    const opts = { fields: [
        'Author',
        'Project Key',
        //'Issue Key',
        'Title',
        'Comment'
        //'Type',
        //'Date',
        //'Hours',
        //'Status'
    ] };
    const parser = new Parser(opts);

    let jsonData = [];
    for (const user of USER_ACCOUNT_IDS) {
        let ud = await getWorklogsForUser(user, start, end);
        jsonData = [...jsonData, ...ud];
    }

    const csv = parser.parse(jsonData);
    res.header('Content-Type', 'text/csv');
    res.attachment('report.csv');

    return res.send(csv);

    //res.send(SERVER_PORT + ' ' + JIRA_URL + ' ' + JIRA_EMAIL + ' ' + JIRA_TOKEN)
})
app.listen(SERVER_PORT);