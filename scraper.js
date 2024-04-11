require("dotenv").config();
const puppeteer = require("puppeteer");
const queries = require("./Queries/queries");
const pool = require("./db");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

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
      subject: `${cardName} is now available on trollandtoad.com`,
      text: `Find ${cardName} on trollandtoad.com with the link below\n${cardLink}`,
    };

    const result = await transport.sendMail(mailOptions);
    return result;
  } catch (e) {
    return e;
  }
}

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  //get the last page number to know how many times to iterate through search
  await page.goto("https://www.amazon.com/s?k=yugioh+card+singles&ref=sr_pg_1");

  //lastPage is a string ex. "8"
  // const lastPage = await page.evaluate(() => {
  //   return document.getElementsByClassName("s-pagination-disabled")[1]
  //     .textContent;
  // });

  const nodeList = await page.evaluate(() => {
    function extractSrc(rawStr) {
      const rx = / src="([^"]*([^"]*(?:[^\\"]|\\\\|\\")*)+)"/gi;
      const arr = rx.exec(rawStr);

      if (arr.length > 0) return arr[0];
      return "";
    }

    return Array.from(
      document.querySelectorAll('[data-component-type="s-search-result"]')
    ).map((e) => {
      //getting amazon href is fucked
      let trimmedHtml = e.innerHTML.trim();
      let trimmedText = e.textContent.trim();
      let startIndex = 0;

      let href = trimmedHtml.substring(
        trimmedHtml.indexOf("href") + 6,
        trimmedHtml.indexOf("&amp;sr=") + 12
      );
      if (e.textContent.trim().includes("Edition")) {
        if (trimmedText.includes(".")) {
          startIndex = trimmedText.indexOf(".");
        }
      }
      let imgSrc = extractSrc(trimmedHtml);
      let price = trimmedText.substring(
        trimmedText.indexOf("$"),
        trimmedText.indexOf("$") + 5
      );

      let path = href;
      let root = `https://www.amazon.com`;

      let obj = {
        imagesource: imgSrc.substring(6, imgSrc.indexOf(".jpg") + 4),
        name: trimmedText.substring(0, trimmedText.indexOf("Edition") + 7),
        prices: [
          {
            price: price,
            sourcesite: "Amazon",
          },
        ],
        link: `${root}${path}`,
      };
      return obj;
    });
  });

  await browser.close();

  pool.query(queries.deleteOldCards, [0], (error, result) => {
    if (error) throw error;
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

    result.rows.forEach((user) => {
      console.log(user);
      user.watchlist.forEach((item) => {
        for (let i = 0; i < nodeList.length - 1; i++) {
          if (
            nodeList[i].name
              .toLowerCase()
              .substring(0, 30)
              .includes(item.toLowerCase())
          ) {
            link = nodeList[i].link.replace(/"/gi, "");
            sendMail(access_token, user.email, nodeList[i].name, link).then(
              (result) => console.log("mail sent")
            );
          }
        }
      });
    });
  });
})();
