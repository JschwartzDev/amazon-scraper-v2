require("dotenv").config();
const puppeteer = require("puppeteer");
const queries = require("./Queries/queries");
const pool = require("./db");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const {
  ToadScheduler,
  SimpleIntervalJob,
  AsyncTask,
} = require("toad-scheduler");

const userAgents = [
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5387.128 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36}}l8xqx",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36%}w1xn2",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.75 615",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Trailer/97.3.7892.93 623",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.75 622",
];

const scheduler = new ToadScheduler();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN,
});

async function sendMail(token, toAddress, cardName, cardLink) {
  try {
    const access_token = token;
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: "deckdexautomated@gmail.com",
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: access_token,
      },
    });

    const mailOptions = {
      from: "deckdexautomated@gmail.com",
      to: `${toAddress}`,
      subject: `${cardName} is now available on Amazon.com`,
      text: `Find ${cardName} on Amazon.com with the link below\n${cardLink}`,
    };

    const result = await transport.sendMail(mailOptions);
    return result;
  } catch (e) {
    return e;
  }
}

const task = new AsyncTask(
  "simple task",
  async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    //get the last page number to know how many times to iterate through search
    await page.goto(
      "https://www.amazon.com/s?k=yugioh+card+singles&ref=sr_pg_1"
    );

    //lastPage is a string ex. "8"
    const lastPage = await page.evaluate(() => {
      return document.getElementsByClassName("s-pagination-disabled")[1]
        .textContent;
    });

    //delete cards in DB before starting loop
    pool.query(queries.deleteOldCards, [0], (error, result) => {
      if (error) throw error;
    });

    for (let i = 1; i <= lastPage; i++) {
      await page.setUserAgent(
        userAgents[Math.random() * userAgents.length - 1]
      );

      await page.goto(
        `https://www.amazon.com/s?k=yugioh+card+singles&page=${i}`
      );

      await page.waitForSelector('[data-component-type="s-search-result"]');

      let nodeList = await page.evaluate(() => {
        function extractSrc(rawStr) {
          const rx = / src="([^"]*([^"]*(?:[^\\"]|\\\\|\\")*)+)"/gi;
          const arr = rx.exec(rawStr);

          if (arr.length > 0) return arr[0];
          return "";
        }

        return Array.from(
          document.querySelectorAll('[data-component-type="s-search-result"]')
        ).map((e) => {
          let trimmedHtml = e.innerHTML.trim();
          let trimmedText = e.textContent.trim();
          let startIndex = 0;

          let href = trimmedHtml.substring(
            trimmedHtml.indexOf("href") + 6,
            trimmedHtml.indexOf("&amp;sr=") + 12
          );
          if (e.textContent.trim().includes("Edition")) {
            if (trimmedText.includes(".")) {
              startIndex = trimmedText.indexOf(".") + 1;
            }
          }
          let imgSrc = extractSrc(trimmedHtml);
          let price = trimmedText.substring(
            trimmedText.indexOf("$"),
            trimmedText.indexOf("$") + 5
          );

          let path = href;
          let root = `https://www.amazon.com`;
          let link = `${root}${path}`;

          let obj = {
            imagesource: imgSrc.substring(6, imgSrc.indexOf(".jpg") + 4),

            prices: [
              {
                price: price,
                sourcesite: "Amazon",
              },
            ],
            link: link,
            name: link.substring(
              link.indexOf(".com") + 5,
              link.indexOf("dp") - 1
            ),
          };
          return obj;
        });
      });

      //filter items that arent cards ex. deck boxes etc...
      nodeList = nodeList.filter((item) => {
        if (item.name.trim().toLowerCase().includes("edition")) {
          return item;
        }
        if (item.name.trim().toLowerCase().includes("en0")) {
          return item;
        }
      });

      for (let i = 0; i < nodeList.length - 1; i++) {
        // console.log(nodeList[i]);
        // console.log("-----------------------------------");

        if (nodeList[i] !== null) {
          let values = [
            nodeList[i].name,
            nodeList[i].imagesource,
            nodeList[i].prices,
            nodeList[i].link,
          ];
          pool.query(queries.insertCards, values, (error, result) => {
            if (error) throw error;
          });
        }
      }
      //get googleapis access token for emails
      const access_token = await oAuth2Client.getAccessToken();

      pool.query(queries.getAllWatchLists, (error, result) => {
        if (error) throw error;

        const checkWordArray = (wordArr, cardName, count = 0) => {
          for (let i = 0; i < wordArr.length - 1; i++) {
            if (cardName.toLowerCase().includes(wordArr[i].toLowerCase())) {
              count++;
            }
          }
          if (count === wordArr.length - 1) {
            return true;
          } else {
            return false;
          }
        };

        result.rows.forEach((user) => {
          user.watchlist.forEach((item) => {
            const wordArr = item.trim().split(" ");
            for (let i = 0; i < nodeList.length - 1; i++) {
              if (checkWordArray(wordArr, nodeList[i].name)) {
                link = nodeList[i].link.replace(/"/gi, "");
                sendMail(access_token, user.email, nodeList[i].name, link).then(
                  () => console.log("mail sent")
                );
              }
            }
          });
        });
      });
      console.log(`finished page ${i}`);
    }
    await browser.close();
  },
  (err) => {
    console.log(err);
  }
);

const job = new SimpleIntervalJob({ hours: 2, runImmediately: true }, task);

scheduler.addSimpleIntervalJob(job);
