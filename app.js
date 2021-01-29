const mongoose = require('mongoose');
const TeleBot = require('telebot');
const WaterMeSettings = require('@mrballs/watermesettings');
const MicroController = WaterMeSettings.MicroController;
const User = WaterMeSettings.User;
const WaterMeEngine = WaterMeSettings.WaterMeEngine.WaterMeEngine;
const cron = require('node-cron');
//const WaterMeEngine = require('@mrballs/watermesettings/WaterMeEngine/WaterMeEngine');
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

//scheduled evaluations

const watering_time_interval = 10; //minutes

cron.schedule(`*/${watering_time_interval} * * * *`, () => {
  // run schedule evaluation for controllers
  scheduled_evaluation();
});

/**
 * @function scheduled_evaluation
 * @description Goes through all the microcontrollers and evaluates the sensor conditions to water the plants.
 * On a first stage this function sends a telegram message to the subscribed users.
 */
function scheduled_evaluation() {

  MicroController.find()
  .then( all_controllers => {

    for (const controller of all_controllers) {
      let waterme_engine = new WaterMeEngine(controller.sensors, controller.location);
      controller.populate('users').execPopulate()
      .then( populated_controller => {
        for (const user of populated_controller.users) {
          if (waterme_engine.evaluateWaterMe()
          && user.notifications) {
            let message = `Time to water the plants`;
            console.log(`Watering message sent to ${user.telegram.first_name} about ${populated_controller.mac_address}`);
            bot.sendMessage(user.telegram.user_id, message);
          }
        }
      })
      .catch(err => {
        console.log(err)
      })
    }
  })
  .catch(err => {
    console.log(err)
  })
};


//bot commands

const commands = [
  {key: "/start",                                 description: "Sends a list of available commands and creates an account for the Telegram User in the WaterMe"},               //User dependent
  {key: "/subscribe <controller id>",             description: "Subscribes controller with <controller id> to user. <controller id> is the controller Mac Address"},            //User dependent
  {key: "/myuser",                                description: "Sends user information to the chat"},                                                                           //User dependent
  {key: "/latest",                                description: "Sends latest registered data Sample for all the sensors of one MicroController"},
  {key: "/temperature",                           description: "Sends latest registred Temperature for all the Temperature sensors"},
  {key: "/humidity",                              description: "Sends latest registred Temperature for all the Humidty sensors"},
  {key: "/SMS",                                   description: "Sends latest registred Temperature for all the Soil Moisture sensors"},
  {key: "/history <sensor> <number of readings>", description: "Sends the last <number_of_readings> readings sensor data history for <sensor>"},
  {key: "/notify",                                description: "Sends a status report for notifications. Can also set notifications with /notify <status>. Being <status> on or off."},
  {key: "/status",                                description: "Sends a status report for all sensors."},
  {key: "/version",                               description: "Sends the Version of the WaterMe decision engine."}
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

// Evaluates if plants should be watered
bot.on('/evaluate', (msg) => {
  scheduled_evaluation();
})

// Help command. Displays available commands
bot.on('/help', (msg) => {
  let reply_message = "Welcome to WaterMe Telegram Bot\n There are several commands available: \n";
  for (const command of commands) {
    reply_message += `${command.key} -> ${command.description}\n`
  }

  bot.sendMessage(msg.from.id, reply_message);
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
    },
    notifications: true
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
      bot.sendMessage(msg.from.id,`Controller does not exist.`, { replyToMessage: msg.message_id });
      console.log("Code 4003.");
      return;
    }

    User.findOne({telegram: _user.telegram})
    .then( found_user => {

      // user does not exist
      if (found_user == null) {
        bot.sendMessage(msg.from.id,`User does not exist.`, { replyToMessage: msg.message_id });
        console.log("Code 4004.");
        return;
      }
      return found_user.populate('microcontrollers').execPopulate();
    })
    .then( found_user => {
      if (found_user.microcontrollers.some(controller => {
        return controller.mac_address == microcontroller_id;
      })) {
        bot.sendMessage(msg.from.id,`Controller already subscribed.`, { replyToMessage: msg.message_id });
        console.log("Code 4005.");
        throw "Controller already subscribed";
      }
      
      found_user.microcontrollers.push(controller._id);
      return User.findOneAndUpdate({telegram: found_user.telegram}, {microcontrollers: found_user.microcontrollers});
    })
    .then( updated_user => {
      _user = updated_user;
      bot.sendMessage(msg.from.id,`Microcontroller subscribed.`, { replyToMessage: msg.message_id });
      console.log('User was updated with controller.');

      return MicroController.findOne({mac_address: microcontroller_id});
    })
    .then( controller => {
      controller.users.push(_user);

      return MicroController.findOneAndUpdate({mac_address: microcontroller_id}, {users: controller.users});
    })
    .then( updated_controller => {
      console.log('Microcontroller was updated with user.')

    })
    .catch( err => {
      console.log(err);
    })
    
  })
  .catch( err => {
    console.log(err);
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
  
    let message = `User information:\nemail: ${found_user.email}\ntelegram_id:${found_user.telegram.user_id}\nFirst name: ${found_user.telegram.first_name}\nLast name: ${found_user.telegram.last_name}\nNotifications: ${found_user.notifications ? "On" : " Off"}\n`
    
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

//returns microcontroller status
bot.on("/status", (msg) => {

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
    let status_message = `Controllers:\n`;
    if (found_user.microcontrollers.length > 0) {
      for (const controller of found_user.microcontrollers) {
        let engine = new WaterMeEngine(controller.sensors, controller.location);
        status_message += `${controller.mac_address}\n`;
        status_message += `Sensor Availability:\nTemperature: ${engine.temperatureSensorAvailable() ? "On" : "Off"}\nHumidity:${engine.humiditySensorAvailable() ? "On" : "Off"}\nSoil Moisture: ${engine.soilMoistureSensorAvailable() ? "On" : "Off"}\nWeather API: ${engine.externalWeatherAPIAvailable() ? "On" : "Off"}\n`
      }
    }
    bot.sendMessage(msg.from.id, status_message);
  })
  .catch(err => {
    console.log(err);
  })
})

//changes, toggle notifications
bot.on('/notify', (msg) => {

  let status = msg.text.split(' ')[1];
  
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
    if (found_user.notifications == undefined) {
      console.log(found_user);
      User.findOne({telegram: found_user.telegram})
      .then(user => {
        user.notifications = true;
        user.save()
        .then(user =>{
          bot.sendMessage(msg.from.id,`Notifications are ${user.notifications ? "On" : " Off"}`, { replyToMessage: msg.message_id });
        })
      })
      .catch(err => {
        console.log(err);
      })
    }
    else if (status == '') {
      bot.sendMessage(msg.from.id,`Notifications are ${found_user.notifications ? "On" : " Off"}`, { replyToMessage: msg.message_id });
    }
    else if (status == 'on') {
      User.findOne({telegram: found_user.telegram})
      .then(user => {
        user.notifications = true;
        user.save()
        .then( user => {
          bot.sendMessage(msg.from.id,`Notifications are ${found_user.notifications ? "On" : " Off"}`, { replyToMessage: msg.message_id });
        })
      })
      .catch(err => {
        console.log(err);
      })
    }else{
      User.findOne({telegram: found_user.telegram})
      .then(user => {
        user.notifications = false;
        user.save()
        .then(user => {
          bot.sendMessage(msg.from.id,`Notifications are ${user.notifications ? "On" : " Off"}`, { replyToMessage: msg.message_id });
        })
      })
      .catch(err => {
        console.log(err);
      })
    }
})

})

//returns available sensors
bot.on('/sensors', (msg) => {

  //User
  const _user = new User({
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
    if (found_user.microcontrollers.length>0) {
      for (const microcontroller of found_user.microcontrollers) {
        let microcontroller_id = `${microcontroller.mac_address}\n`;
        let Engine = new WaterMeEngine(microcontroller.sensors, microcontroller.location);
        console.log("pass")
          console.log(Engine)
          let reply_message = 
          `Sensor Availability:\nTemperature: ${Engine.temperatureSensorAvailable() ? "Yes" : "No"}\nHumidity: ${Engine.humiditySensorAvailable() ? "Yes" : "No"}\nSoil Moisture: ${Engine.soilMoistureSensorAvailable() ? "Yes" : "No"}`
          
          bot.sendMessage(msg.from.id,microcontroller_id+reply_message, { replyToMessage: msg.message_id });
        }
      }
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
        let message =
        `${reading_time} : ${sensor.type} -> ${reading_value}\nWatering Interval is set between:\nmax: ${sensor.watering_threshold.max} \nmin: ${sensor.watering_threshold.min}`
        bot.sendMessage(msg.from.id, message, { replyToMessage: msg.message_id });
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

// Sends WaterMe bot version
bot.on('/version', (msg) =>{
  let engine = new WaterMeEngine([],'-');
  bot.sendMessage(msg.from.id,`WaterMeEngine Version: ${engine.getVersion()}`, { replyToMessage: msg.message_id });
})

bot.start();

