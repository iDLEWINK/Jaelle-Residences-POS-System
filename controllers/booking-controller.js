const db = require('../models/db.js');
const Activity = require('../models/activity-model.js');
const Booking = require('../models/booking-model.js');
const Guest = require('../models/guest-model.js');
const Room = require('../models/room-model.js');
const Transaction = require('../models/transaction-model.js');
const mongoose = require('mongoose');

const bookingController = {
	getBookingScreen: function (req, res) {
		let today = new Date();
		let dateString = `${today.getFullYear().toString()}-${(today.getMonth() + 1).toString().padStart(2, 0)}-${today.getDate().toString().padStart(2, 0)}`;
		let timeString = `${today.getHours().toString().padStart(2, 0)}:${(today.getMinutes()).toString().padStart(2, 0)}:00`;

		//there is a given time
		if (req.query.time !== undefined) {
			timeString = `${req.query.time}:00`;
		}

		//there is a given date
		if (req.params.year !== undefined && req.params.month !== undefined && req.params.day !== undefined) {
			dateString = `${req.params.year}-${req.params.month}-${req.params.day}`;
		}

		let date = new Date(`${dateString} ${timeString}`);

		//find all the rooms in the database
		db.findMany(Room, {}, function (roomResult) {

			if (roomResult) {

				let list = [];
				//transform the list of rooms into an object so that a booking may be later linked to a room
				for (let i = 0; i < roomResult.length; i++) {
					let room = {
						room: roomResult[i],
						booking: {}
					}
					list.push(room);
				}

				let booking = {
					//the current date is between the start date and end date of the booking, inclusive
		            start_date: {$lte: date},
		            end_date: {$gte: date},
					//it is considered to be a reservation when the confirmed_reservation does not exists in the database (i.e., it was a direct booking)
					//or the reservation has been confirmed
		            $or: [
						{confirmed_reservation: {$exists: false}},
		            	{confirmed_reservation: true}
					],
					is_cancelled: false
		        };

				db.findMany(Booking, booking, function (bookingResult) {
		        	if (bookingResult) {
						//loop through each booking
						for (let i = 0; i < bookingResult.length; i++) {
							//loop through each room
							for (let j = 0; j < list.length; j++) {
								//check if the room id of the booking matches the id of the room
								if (list[j].room._id.toString() == bookingResult[i].room._id.toString()) {
									//links the room to a booking
									list[j].booking = bookingResult[i];
									list[j].booking.booked = true;
									break;
								}
							}
							//loop through each of the connected rooms in the booking
							for(let k = 0; k < bookingResult[i].room.connected_rooms.length; k++) {
								//loop through each room
								for (let j = 0; j < list.length; j++) {
									//check if the room id of the connected rooms in the booking matches the id of the room
									if (list[j].room._id.toString() == bookingResult[i].room.connected_rooms[k].toString()) {
										//make the room unavailable
										list[j].booking.unavailable = true;
										break;
									}
								}
							}
						}

						let values = {
							username: req.session.username,
							list: list,
							date: dateString,
							time: timeString
						}

						//loads the main booking page
						res.render('booking-main', values);
		        	} else {
						res.redirect('/error');
					}
		        }, 'room guest');
			} else {
				res.redirect('/error')
			}
		}, undefined, {room_number: 'asc'});
	},

	getCreateBooking: function(req, res) {
		//find the information of the room given a roomID
		db.findOne(Room, {_id: req.params.roomID}, function(roomResult) {
			if (roomResult) {

				let date = new Date(`${req.params.year}-${req.params.month}-${req.params.day}`);

				let reservation = {
		            //the current date is between the start date and end date of the reservation, inclusive
					start_date: date,
 	               	end_date: {$gte: date},
					booked_type: roomResult.room_type,
		            //it is considered to be a reservation when the confirmed_reservation exists in the database
		            confirmed_reservation: false,
		            is_cancelled: false
		        };
				//find all the reservations such that the current date is between the start and end date of the reservation
				db.findMany(Booking, reservation, function (reservationResult) {
					let values = {
						username: req.session.username,
	                    room: roomResult,
						reservations: reservationResult,
	                    date:date
	                }
					//reender to create booking page
					res.render('booking-create', values);
				}, 'guest');
			} else {
				res.redirect('/error');
			}
		});
	},

	postCreateBooking: function(req, res) {
		// collect the guest information from post request
        let guest = {
            first_name: req.body.firstname,
            last_name: req.body.lastname,
            birthdate: req.body.birthdate,
            address: req.body.address,
            contact_number: req.body.contact,
            company_name: req.body.company,
            occupation: req.body.occupation
        }

        //create a new guest document in the database
        db.insertOne(Guest, guest, function(guestResult){
            if(guestResult) {

				let transaction = {
					duration: req.body.duration,
				    averageRate: req.body.room_rate,
				    roomCost: req.body.room_initial_cost,
				    pax: req.body.room_pax,
				    pwdCount: req.body.room_pwd,
				    seniorCitizenCount: req.body.room_senior,
				    additionalPhpDiscount: {
						reason: req.body.room_discount_reason_php,
						amount: req.body.room_discount_php
					},
				    additionalPercentDiscount: {
						reason: req.body.room_discount_reason_php,
					    amount: req.body.room_discount_percent
					},
				    totalDiscount: req.body.room_subtract,
				    extraCharges: req.body.room_extra,
				    totalCharges: req.body.room_total_extra,
				    netCost: req.body.room_net_cost,
				    payment: req.body.room_payment,
				    balance: req.body.room_balance
				}

				db.insertOne(Transaction, transaction, function(transactionResult) {
					if (transactionResult) {
						//collect the booking information from post request and set default values
		                let booking = {
		                    room: req.params.roomID,
		                    booked_type: req.body.room_type,
		                    guest: guestResult._id,
		                    employee: req.session.employeeID,
		                    start_date: new Date (`${req.body.start_date} 14:00:00`),
		                    end_date: new Date(`${req.body.end_date} 12:00:00`),
							checked_in: false,
		                    is_cancelled: false,
							transaction: transactionResult._id
		                }

		                // create a new booking in the database
		                db.insertOne(Booking, booking, function(bookingResult){
		                    if(bookingResult) {
		                        let activity = {
		                            employee: req.session.employeeID,
		                            booking: bookingResult._id,
		                            activity_type: 'Create Booking',
		                            timestamp: new Date()
		                        }

		                        //saves the action of the employee to an activity log
		                        db.insertOne(Activity, activity, function(activityResult) {
		                            if (activityResult) {
		                                // redirects to home screen after adding a record
		                                res.redirect(`/${req.body.start_date}/booking/`);
		                            } else {
		                                res.redirect('/error');
		                            }
		                        });
		                    } else {
		                        res.redirect('/error');
		                    }
		                });
					} else {
						res.redirect('/error');
					}
				});
            } else {
                res.redirect('/error');
            }
        });
	},

    checkAvailability: function(req, res) {
        // extract dates and room numbers
        let start = new Date(`${req.query.start_date} 14:00:00`);
        let end = new Date(`${req.query.end_date} 12:00:00`);
		let rooms = req.query.rooms;
        let lower_bound = new Date(req.query.start_date);
        let upper_bound = new Date(req.query.end_date);
        lower_bound.setFullYear(lower_bound.getFullYear() - 5);
        upper_bound.setFullYear(upper_bound.getFullYear() + 5);
        // set the conditions for the queries
		booking_query = {
			$and: [
				{room: {$in : rooms}},
				// reservation dates only within 5 years
				{$and: [
					{start_date: {$gte: lower_bound}},
					{end_date: {$lte: upper_bound}}
				]},
				// must be an active booking
				{$and:[
					{$or: [
						{confirmed_reservation: {$exists: false}},
						{confirmed_reservation: true}
					]},
					{is_cancelled: false}
				]},
				// cases to check for existing bookings
				{$or: [
					{$and: [{start_date: {$gte: start}}, {end_date: {$lte: end}}]},
					{$and: [{start_date: {$lte: end}}, {start_date: {$gte: start}}]},
					{$and: [{end_date: {$gte: start}}, {end_date: {$lte: end}}]},
					{$and: [{start_date: {$lte: start}}, {end_date: {$gte: end}}]}
				]}
			]
		};

		// when checking availability while editing booking, do not include itself as a conflicting booking
		if(req.query.bookingid != ''){
			booking_query.$and.push({_id: {$ne: req.query.bookingid}});
		}

        // find atleast one booking for a specified room between the start and end date inclusive
        db.findOne(Booking, booking_query, function(result){
            // a booking is found
            if(result){
                res.send(false);
            // no booking is found
            } else{
                res.send(true);
            }
        });
    },

	getRoom: function(req, res) {
		let roomID = req.query.roomID;

		db.findOne(Room, {_id: roomID}, function(result) {
			res.send(result);
		});
	},

	confirmReservation: function(req, res) {

		let transaction = {
			duration: req.body.duration,
			averageRate: req.body.room_rate,
			roomCost: req.body.room_initial_cost,
			pax: req.body.room_pax,
			pwdCount: req.body.room_pwd,
			seniorCitizenCount: req.body.room_senior,
			additionalPhpDiscount: {
				reason: req.body.room_discount_reason_php,
				amount: req.body.room_discount_php
			},
			additionalPercentDiscount: {
				reason: req.body.room_discount_reason_php,
				amount: req.body.room_discount_percent
			},
			totalDiscount: req.body.room_subtract,
			extraCharges: req.body.room_extra,
			totalCharges: req.body.room_total_extra,
			netCost: req.body.room_net_cost,
			payment: req.body.room_payment,
			balance: req.body.room_balance
		}

		db.insertOne(Transaction, transaction, function(transactionResult) {
		    if (transactionResult) {

				let reservation = {
		            $set: {
						//assign the guest to a room
						room: req.params.roomID,
						start_date: new Date (`${req.body.start_date} 14:00:00`),
		                end_date: new Date(`${req.body.end_date} 12:00:00`),
						//confirm the reservation
						confirmed_reservation: true,
						pax: req.body.room_pax,
						payment: req.body.room_payment
		            }
		        }
				//confirm the reservation, assign the guest to a room, and update the booking dates
				db.updateOne(Booking, {_id: req.body.reservation_select}, reservation, function (bookingResult) {

					if (bookingResult) {
						let guest = {
				            first_name: req.body.firstname,
				            last_name: req.body.lastname,
				            birthdate: req.body.birthdate,
				            address: req.body.address,
				            contact_number: req.body.contact,
				            company_name: req.body.company,
				            occupation: req.body.occupation,
							transaction: transactionResult._id
				        }
						//upda the information of the guest
						db.updateOne(Guest, {_id: bookingResult.guest}, guest, function (guestResult) {
							if (guestResult) {

								let activity = {
		                            employee: req.session.employeeID,
		                            booking: bookingResult._id,
		                            activity_type: 'Confirm Reservation',
		                            timestamp: new Date()
		                        }
								//saves the action of the employee to an activity log
								db.insertOne(Activity, activity, function(activityResult) {
		                            if (activityResult) {
		                                // redirects to booking screen after adding a record
		                                res.redirect(`/${req.body.start_date}/booking/`);
		                            } else {
		                                res.redirect('/error');
		                            }
		                        });
							} else {
								res.redirect('/error');
							}
						});
					} else {
						res.redirect('/error');
					}

				});

		    } else {
		        res.redirect('/error');
		    }
		});
	},

	getEditBooking: function(req, res) {
		//get the booking information given the bookingID
		db.findOne(Booking, {_id: req.params.bookingID}, function(result) {
			if (result) {
				console.log(result);
				//render the edit booking screen
				res.render('booking-edit', result);
			} else {
				res.redirect('/error');
			}
		}, 'room guest transaction');
	},

	postEditBooking: function(req, res) {
		let booking = {
            $set: {
				start_date: new Date (`${req.body.start_date} 14:00:00`),
                end_date: new Date(`${req.body.end_date} 12:00:00`),
				pax: req.body.room_pax,
				payment: req.body.room_payment
            }
        }

        //update the booking details in the database
        db.updateOne(Booking, {_id: req.params.bookingID}, booking, function(bookingResult) {

            let guest = {
                $set: {
                    first_name: req.body.firstname,
                    last_name: req.body.lastname,
                    birthdate: req.body.birthdate,
                    address: req.body.address,
                    contact_number: req.body.contact,
                    company_name: req.body.company,
                    occupation: req.body.occupation
                }
            }

            if (bookingResult) {
                //update the customer details in the database
                db.updateOne(Guest, {_id: bookingResult.guest}, guest, function(guestResult) {
                    if (guestResult) {

						let transaction = {
							$set: {
								duration: req.body.duration,
								averageRate: req.body.room_rate,
								roomCost: req.body.room_initial_cost,
								pax: req.body.room_pax,
								pwdCount: req.body.room_pwd,
								seniorCitizenCount: req.body.room_senior,
								additionalPhpDiscount: {
									reason: req.body.room_discount_reason_php,
									amount: req.body.room_discount_php
								},
								additionalPercentDiscount: {
									reason: req.body.room_discount_reason_php,
									amount: req.body.room_discount_percent
								},
								totalDiscount: req.body.room_subtract,
								extraCharges: req.body.room_extra,
								totalCharges: req.body.room_total_extra,
								netCost: req.body.room_net_cost,
								payment: req.body.room_payment,
								balance: req.body.room_balance
							}
						}

						db.updateOne(Transaction, {_id: bookingResult.transaction}, transaction, function(transactionResult) {
						    if (transactionResult) {

								let activity = {
									employee: req.session.employeeID,
									booking: bookingResult._id,
									activity_type: 'Modify Booking',
									timestamp: new Date()
								}

								//saves the action of the employee to an activity log
								db.insertOne(Activity, activity, function(activityResult) {
									if (activityResult) {
										// redirects to home screen after updating the booking
										res.redirect(`/${req.body.start_date}/booking/`);
									} else {
										res.redirect('/error');
									}
								});

						    } else {
						        res.redirect('/error');
						    }
						});
                    } else {
                        res.redirect('/error');
                    }
                });
            } else {
                res.redirect('/error');
            }
        });
	}

}

module.exports =  bookingController;
