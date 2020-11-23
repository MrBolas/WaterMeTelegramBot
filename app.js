const mongoose = require('mongoose');
const TeleBot = require('telebot');
const MicroController = require('@mrballs/watermesettings');
const environment_v = require('dotenv').config()
const bot = new TeleBot(process.env.BOT_API_KEY);


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

const commands = [
  {key: "/latest",                                description: "Sends latest registered data Sample for all the sensors of one MicroController"},
  {key: "/temperature",                           description: "Sends latest registred Temperature for all the Temperature sensors"},
  {key: "/humidity",                              description: "Sends latest registred Temperature for all the Humidty sensors"},
  {key: "/SMS",                                   description: "Sends latest registred Temperature for all the Soil Moisture sensors"},
  {key: "/history <sensor> <number of readings>", description: "Sends the last <number_of_readings> readings sensor data history for <sensor>"},
];

/* Requirements:
*  -> Add /start Command. this is Launched in the beggining of the conversation and it is great for configuration flow
*  -> Has a user i expect the bot to delivery on demand sensor information
*  -> Has a user i expect the bot to send a warning when sensors reach a certain threshold  
*  -> Has a user i expect the bot to send certain flares of personality from time to time
*/

// Sanity test command
bot.on('/test', (msg) => {
    return msg.reply.text('Sanity test')
})

// Sends an command list
bot.on('/start', (msg) => {
  let reply_message = "Welcome to WaterMe Telegram Bot\n There are several commands available: \n";
  for (const command of commands) {
    reply_message += `${command.key} -> ${command.description}\n`
  }

  bot.sendMessage(msg.from.id, reply_message);
  return;
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
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween the max: ${sensor.watering_threshold.max} and ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
          }
      }
  })
  .catch(err => {
      console.log(err);
  })
})

// Sends latest registred Temperature for all the Humidity sensors
bot.on('/humidity', (msg) => {
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
          if (sensor.type.includes('DHT'))
          {
              let reading_time = Date(sensor.readings[sensor.readings.length-1].time);
              let reading_value = sensor.readings[sensor.readings.length-1].value
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween the max: ${sensor.watering_threshold.max} and ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
          }
      }
  })
  .catch(err => {
      console.log(err);
  })
})

// Sends latest registred Temperature for all the Soil Moisture Sensors
bot.on('/SMS', (msg) => {
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
          if (sensor.type.includes('SMS'))
          {
              let reading_time = Date(sensor.readings[sensor.readings.length-1].time);
              let reading_value = sensor.readings[sensor.readings.length-1].value
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween the max: ${sensor.watering_threshold.max} and ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
          }
      }
  })
  .catch(err => {
      console.log(err);
  })
})

// Sends readings history from the selected sensor
bot.on('/history', (msg) => {
  let req_sensor = msg.text.split(' ')[1];
  let number_of_samples = msg.text.split(' ')[2];
  let requested_readings = [];
  let message = 'No readings available.';

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
    
    //Search for readings
    for (const sensor of controller.sensors) {
      if (sensor.type.includes(req_sensor))
      {
        let readings_size = sensor.readings.length;
        for (let index = readings_size; index > array.length-number_of_samples; index--) {
          requested_readings.push(sensor.readings[index]);             
        }
      }
    }
    
    //Compile Message
    if (requested_readings.length > 0) {
      message = `Readings Requested for ${req_sensor}:\n`;
      for (const reading of requested_readings) {
        message += `${reading.value}\n`
      }
    }
    bot.sendMessage(msg.from.id,message);  
  })
  .catch(err => {
      console.log(err);
  })
})

bot.start();