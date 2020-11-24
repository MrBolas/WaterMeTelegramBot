const mongoose = require('mongoose');
const TeleBot = require('telebot');
const WaterMeSettings = require('@mrballs/watermesettings');
const MicroController = WaterMeSettings.MicroController;
const User = WaterMeSettings.User;
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
  {key: "/start",                                 description: "Sends a list of available commands and creates an account for the Telegram User in the WaterMe"},
  {key: "/subscribe <controller id>",             description: "Subscribes controller with <controller id> to user. <controller id> is the controller Mac Address"},
  {key: "/myuser",                                description: "Sends user information to the chat"},
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
  console.log(msg);
    return msg.reply.text('Sanity test')
})

//display available commands and create account
bot.on('/start', (msg) => {
  // Sends an command list
  let reply_message = "Welcome to WaterMe Telegram Bot\n There are several commands available: \n";
  for (const command of commands) {
    reply_message += `${command.key} -> ${command.description}\n`
  }

  bot.sendMessage(msg.from.id, reply_message);
  
  //Create new user if it doesnt exist
  let new_user = new User({
    email: '-',
    telegram:{
      user_id: msg.from.id,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name
    }
  })
  
  User.findOne({telegram: new_user.telegram})
  .then( user =>{

    //User not found. Create user
    if (user == null) {
      new_user.save()
      console.log('New user created');
    }
    else{
      console.log('User already exists');
    }
  })
  .catch( err => {
    console.log(err);
  })
  return;
})

//subscribe microcontroller to user account
bot.on('/subscribe', (msg) => {

  let microcontroller_id = msg.text.split(' ')[1];

  if (microcontroller_id == null) {
    bot.sendMessage(msg.from.id,`No Controller id provided`, { replyToMessage: msg.message_id });
    console.log("Code 4006.");
    return;
  }

  let _user = new User({
    email: '-',
    telegram:{
      user_id: msg.from.id,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name
    }
  })

  MicroController.findOne({mac_address: microcontroller_id})
  .then( controller => {

    // controller does not exist
    if (controller == null) {
      bot.sendMessage(msg.from.id,`Controller does not exist`, { replyToMessage: msg.message_id });
      console.log("Code 4003.");
      return;
    }

    User.findOne({telegram: _user.telegram})
    .then( found_user => {

      // user does not exist
      if (found_user == null) {
        bot.sendMessage(msg.from.id,`User does not exist`, { replyToMessage: msg.message_id });
        console.log("Code 4004.");
        return;
      }
      return found_user.populate('microcontrollers').execPopulate();
    })
    .then( found_user => {
      if (found_user.microcontrollers.some(controller => {
        return controller.mac_address == microcontroller_id;
      })) {
        bot.sendMessage(msg.from.id,`Controller already subscribed`, { replyToMessage: msg.message_id });
        console.log("Code 4005.");
        throw "Controller already subscribed";
      }
      
      found_user.microcontrollers.push(controller._id);
      return User.findOneAndUpdate({telegram: found_user.telegram}, {microcontrollers: found_user.microcontrollers});
    })
    .then( updated_user => {
      bot.sendMessage(msg.from.id,`Microcontroller subscribed`, { replyToMessage: msg.message_id });
      console.log('User was updated');
    })
    .catch( err => {
      console.log(err);
    })
  })
})

// Returns User data
bot.on('/myuser', (msg) => {

  let _user = new User({
    email: '-',
    telegram:{
      user_id: msg.from.id,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name
    }
  })

  User.findOne({telegram: _user.telegram})
  .then(found_user => {

    //User does not exist
    if (found_user == null) {
      bot.sendMessage(msg.from.id,`No User found`, { replyToMessage: msg.message_id });
      console.log("Code 4007.");
      return; 
    }
    return found_user.populate('microcontrollers').execPopulate();
  })
  .then( found_user => {
  
    let message = `User information:\nemail: ${found_user.email}\ntelegram_id:${found_user.telegram.user_id}\nFirst name: ${found_user.telegram.first_name}\nLast name: ${found_user.telegram.last_name}\n`
    
    if (found_user.microcontrollers.length > 0) {
      message += `Controllers:\n`;
      for (const controller of found_user.microcontrollers) {
        message += `${controller.mac_address}\n`;
      }
    }
    
    bot.sendMessage(msg.from.id, message);
    
  })
  .catch(err => {
    console.log(err);
  })

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
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween max: ${sensor.watering_threshold.max} and min: ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
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
          if (sensor.type.includes('hum'))
          {
              let reading_time = Date(sensor.readings[sensor.readings.length-1].time);
              let reading_value = sensor.readings[sensor.readings.length-1].value
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween max: ${sensor.watering_threshold.max} and min: ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
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
              bot.sendMessage(msg.from.id,`${reading_time} : ${sensor.type} -> ${reading_value}\nBetween max: ${sensor.watering_threshold.max} and min: ${sensor.watering_threshold.min}`, { replyToMessage: msg.message_id });
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
        for (let index = readings_size-1; index > sensor.readings.length-number_of_samples-1; index--) {
          requested_readings.push(sensor.readings[index]);             
        }
      }
    }
    
    //Compile Message
    if (requested_readings.length > 0) {
      message = `Readings Requested for ${req_sensor}:\n`;
      for (const reading of requested_readings) {
        if (reading != undefined) {
          message += `${reading.value}\n`
        }
      }
    }
    bot.sendMessage(msg.from.id,message);  
  })
  .catch(err => {
      console.log(err);
  })
})

bot.start();