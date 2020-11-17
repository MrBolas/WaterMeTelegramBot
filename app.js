const mongoose = require('mongoose');
const TeleBot = require('telebot');
const microController = require('./models/microController');
const environment_v = require('dotenv').config()

const bot = new TeleBot(process.env.BOT_API_KEY);
const MicroController = require('./models/microController');

mongoose.connect(`mongodb://${process.env.DB_HOST}:27017/WaterMe`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log(`Connected to Database: mongodb://${process.env.DB_HOST}:27017/WaterMe`)
})
.catch(() => {
  console.log(`Connection to Database failed: mongodb://${process.env.DB_HOST}:27017/WaterMe`)
});

/* Requirements:
*  -> Has a user i expect the bot to delivery on demand sensor information
*  -> Has a user i expect the bot to send a warning when sensors reach a certain threshold  
*  -> Has a user i expect the bot to send certain flares of personality from time to time
*/

bot.on('/test', (msg) => {
    return msg.reply.text('Sanity test')
})

// Sends latest registered data Sample for all the sensors of one MicroController
bot.on('/latest', (msg) => {
  MicroController.findOne()
  .then(controller => {
    if (controller == null) {
      bot.sendMessage(msg.from.id,`Something went wrong.`, { replyToMessage: msg.message_id });
      console.log("Code 4001.");
      return;
    }
    
    if (controller.sensors == null) {
      bot.sendMessage(msg.from.id,`Something went wrong.`, { replyToMessage: msg.message_id });
      console.log("Code 4002.");
      return;
    }

    let response_message= ''; 
    let sensor_recorded_time;
    for (const sensor of controller.sensors) {
      let reading_time = Date(sensor.readings[sensor.readings.length-1].time);
      let reading_value = sensor.readings[sensor.readings.length-1].value;
      sensor_recorded_time = `${reading_time}\n`;
      response_message += `${sensor.type} -> ${reading_value}\n`;
    }

    bot.sendMessage(msg.from.id, sensor_recorded_time+response_message, { replyToMessage: msg.message_id });
  })
  .catch(err => {
    console.log(err);
  })
})

// Sends latest registred Temperature for all the Temperature sensors
bot.on('/temperature', (msg) => {
  MicroController.findOne()
  .then(controller => {
      if (controller == null) {
        bot.sendMessage(msg.from.id,`Something went wrong.`, { replyToMessage: msg.message_id });
        console.log("Code 4001.");
        return;
      }
      
      if (controller.sensors == null) {
        bot.sendMessage(msg.from.id,`Something went wrong.`, { replyToMessage: msg.message_id });
        console.log("Code 4002.");
        return;
      }
      
      for (const sensor of controller.sensors) {
          if (sensor.type.includes('temp'))
          {
              let reading_time = Date(sensor.readings[sensor.readings.length-1].time);
              let reading_value = sensor.readings[sensor.readings.length-1].value
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}`, { replyToMessage: msg.message_id });
          }
      }
  })
  .catch(err => {
      console.log(err);
  })
})


bot.start();