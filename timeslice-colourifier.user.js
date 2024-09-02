// ==UserScript==
// @name         Timeslice Colourifier
// @namespace    com.azzo.timeslice
// @version      1.0.0
// @downloadURL  https://github.com/AZZO/timeslice-colourifier/raw/main/timeslice-colourifier.user.js
// @updateURL    https://github.com/AZZO/timeslice-colourifier/raw/main/timeslice-colourifier.user.js
// @description  Apply per-job colouring to timeslice time slices
// @author       Cary Symes
// @match        https://go.timeslice.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=timeslice.io
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/arrive/2.4.1/arrive.min.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// ==/UserScript==

const jobSearchCard = /Job: (J\d+)/;
const taskSearchCard = /Task: (.+)/;
const jobSearch = /(J\d+)/;
const taskSearch = /(.+)/;
const cssSanitiser = /\W+/gi;
const classPrefix = 'customColour_';
const defaultSuffix = 'defaultColour';
const defaultColourOptions = 10;

// courtesy of https://stackoverflow.com/a/44615197/1543908
const hexToLuma = (colour) => {
    const r = parseInt(colour.substr(1, 2), 16);
    const g = parseInt(colour.substr(3, 2), 16);
    const b = parseInt(colour.substr(5, 2), 16);

    return [
        0.299 * r,
        0.587 * g,
        0.114 * b
    ].reduce((a, b) => a + b) / 255;
};
const hexToComplement = (colour, luma) => {
    const diff =
        luma < 0.5 ?
            255 * Math.exp(-luma) :
            -Math.exp(luma * Math.log(255));

    let r = parseInt(colour.substr(1, 2), 16) + diff;
    let g = parseInt(colour.substr(3, 2), 16) + diff;
    let b = parseInt(colour.substr(5, 2), 16) + diff;

    r = ((r < 255) ? parseInt(r) : 255).toString(16);
    g = ((g < 255) ? parseInt(g) : 255).toString(16);
    b = ((b < 255) ? parseInt(b) : 255).toString(16);

    r = r.length == 1 ? ('0' + r) : r
    g = g.length == 1 ? ('0' + g) : g
    b = b.length == 1 ? ('0' + b) : b

    return `#${r}${g}${b}`;
};
// courtesy of https://stackoverflow.com/a/49975078/1543908
function rgbToHex(orig) {
    var rgb = orig.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+),?([^,\s)]+)?/i),
        alpha = (rgb && rgb[4] || '').trim(),
        hex = rgb ?
            (rgb[1] | 1 << 8).toString(16).slice(1) +
            (rgb[2] | 1 << 8).toString(16).slice(1) +
            (rgb[3] | 1 << 8).toString(16).slice(1) : orig;

    return hex;
}

// add the necessary CSS styles to the page and persist the value in the backing data store
function setAndStoreValue(label, value, skipStore = false) {
    // decide on a text colour that will give good contrast
    var luma = hexToLuma(value);
    var altColour = hexToComplement(value, luma);

    GM_addStyle(`.${classPrefix}${label} {background-color: ${value} !important; color: ${altColour} !important;}`);
    GM_addStyle(`.${classPrefix}${label} .day-event-tube {border-color: ${altColour} !important;}`);

    if (!skipStore) {
        // update the value in the store
        GM_setValue(label, value);
    }
}

function getColourForLabel(label) {
    return GM_getValue(label);
}

// combine job and task for ids to ensure proper grouping
function generateLabel(job, task) {
    return (job + '_' + task).replace(cssSanitiser, '_');
}


(function () {
    'use strict';

    var $ = window.jQuery;

    // entry editing

    function addColourPickerToModal(modalNode) {
        // create necessary HTML elements for our colour picker
        var modalTitle = modalNode.find('#Title')
        var wrapperDiv = $(document.createElement('div'))
        wrapperDiv.addClass('colour-title-wrapper');

        var floatDiv = $(document.createElement('div'))
        floatDiv.addClass('colour-picker-container');

        var label = $(document.createElement('span'))
        label.addClass('colour-picker-label');
        label.text('Task Customisation: ');

        var picker = $(document.createElement('input'))
        picker.addClass('colour-picker');
        picker.prop('type', 'color');
        picker.prop('job', label);

        floatDiv.append(label);
        floatDiv.append(picker);

        modalTitle.replaceWith(wrapperDiv);
        wrapperDiv.append(modalTitle);
        wrapperDiv.append(floatDiv);

        // hook input to set the value (to both storage and style)
        picker.on('input', function () {
            var value = $(this).val();
            var job = $(document).find('#Timesheet-Job').val().match(jobSearch)[1];
            var task = $(document).find('#Timesheet-Task').val().match(taskSearch)[1];
            var label = generateLabel(job, task);
            setAndStoreValue(label, value);
        });

        $(modalNode).find('#Timesheet-Save').on('click', function () {
            // update the classes on the current entry
            // unfortunately the easiest way to do this is to reapply the classes to all entries
            $(document).find('.day-event').each(function () {
                handleSliceNode($(this));
            });
        });
    }

    function onJobOrTaskChange() {
        var wrapper = $(document).find('.colour-picker-container');
        var picker = wrapper.find('input.colour-picker');

        // set existing colour on picker
        var job = $(document).find('#Timesheet-Job').val().match(jobSearch);
        var task = $(document).find('#Timesheet-Task').val().match(taskSearch);

        if (job === null || task === null) {
            wrapper.hide();
            return;
        } else {
            var label = generateLabel(job[1], task[1]);

            var existingColour = GM_getValue(label);
            if (existingColour === undefined) {
                existingColour = determineDefaultColour();
            }

            picker.val(existingColour);
            wrapper.show();
        }
    }

    function watchModalFieldChanges() {
        // can't use the input event due to the page itself manipulating the values directly
        var prevJob = null;
        var prevTask = null;
        setInterval(function () {
            var jobEl = $(document).find('#Timesheet-Job');
            var taskEl = $(document).find('#Timesheet-Task')

            // check if the editor pane is open before doing anything
            if (jobEl.length == 0 || taskEl.length == 0) {
                return;
            }

            var job = jobEl.val().match(jobSearch);
            var task = taskEl.val().match(taskSearch);

            if (job !== prevJob || task !== prevTask) {
                onJobOrTaskChange();
                prevJob = job;
                prevTask = task;
            }
        }, 100);
    }

    // entry colouring

    function handleSliceNode(dayNode) {
        // remove any existing task classes on this node
        var classes = dayNode.prop('class').split(' ');
        for (let cls of classes) {
            if (cls.startsWith(classPrefix)) {
                dayNode.removeClass(cls);
            }
        }

        // determine job ID and add it as a class for our colouring to apply
        var job = dayNode.prop('title').match(jobSearchCard);
        var task = dayNode.prop('title').match(taskSearchCard);

        var label;
        if (job == null || task == null) {
            label = defaultSuffix;
        }
        else {
            label = generateLabel(job[1], task[1]);
        }

        if (!getColourForLabel(label)) {
            label = defaultSuffix;
        }

        dayNode.addClass(`${classPrefix}${label}`);
    }

    // default entry colour management

    function addDefaultColourPickerToSidebar() {
        var sectionDiv = $(document.createElement('div'));
        sectionDiv.prop('id', 'DefaultColourPicker');

        var header = $(document.createElement('h3'));
        header.addClass('colour-default-title');
        header.text('Default Task Colour');

        var picker = $(document.createElement('input'));
        picker.addClass('colour-picker-default');
        picker.prop('type', 'color');
        picker.val(determineDefaultColour());

        header.append(picker);
        sectionDiv.append(header);
        $(document).find('#Sidebar').append(sectionDiv);

        // hook input to set the value (to both storage and style)
        picker.on('input', function () {
            var value = $(this).val();
            setAndStoreValue(defaultSuffix, value);
        });
    }

    function initDefaultColour() {
        var colour = determineDefaultColour();

        // ensure it's stored and has the class initialised
        setAndStoreValue(defaultSuffix, colour);
    }

    function determineDefaultColour() {
        var stored = GM_getValue(defaultSuffix);
        if (stored) return stored;

        // generate a random index to take a choice from the default colourset on first run, then save it for following page loads
        var colIndex = Math.floor(Math.random() * defaultColourOptions);
        var tempElement = $('<div>').addClass('coloredCheckbox').addClass('colour-' + colIndex).hide().appendTo('body');
        var colour = tempElement.css('background-color');
        tempElement.remove();

        return '#' + rgbToHex(colour);
    }

    // add necessary custom styling
    GM_addStyle('.colour-title-wrapper {display: flex; justify-content: space-between; align-items: center;}');
    GM_addStyle('.colour-picker-container {display: flex; align-items: center;}');
    GM_addStyle('.colour-picker-label {margin-right: 10px;}');
    GM_addStyle('.colour-picker-default {margin: 0 8px; width: 22px; height: 24px;}');
    GM_addStyle('.colour-default-title {display: flex; align-items: center;}');

    // enumerate stored values and add styles at page load
    var savedValues = GM_listValues();
    for (let key of savedValues) {
        var savedColour = GM_getValue(key);

        setAndStoreValue(key, savedColour, true);
    }

    // initialise the default colour, if it hasn't been set before
    initDefaultColour();

    // add an interval task to check if the job or task has changed
    watchModalFieldChanges();

    // add style classes to all entries
    $(document).arrive('.day-event', function () {
        handleSliceNode($(this));
    });

    // add the colour picker elements to the editor modal popup
    $(document).arrive('.ui-modal', function () {
        addColourPickerToModal($(this))
    });

    // add global config options to the sidebar
    $(document).arrive('#CalendarUsers', function () {
        addDefaultColourPickerToSidebar();
    });
})();
