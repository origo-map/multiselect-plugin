const blue = [0, 153, 255, 1];
const lightblue = [0, 153, 255, 0.1];
const white = [255, 255, 255, 1];
const mediumblue = [0, 153, 255, 0.25];
const width = 3;

/** Default symbol when choosing betweeen objects to buffer */
const choose = [{
zIndex: 1,
    fill: {
    color: mediumblue
},
stroke: {
    color: white,
        width: width + 3
},
circle: {
    radius: 5,
        stroke: {
        color: blue
    },
    fill: {
        color: blue
    }
}
  },
{
    zIndex: 2,
        stroke: {
        color: blue,
            width: width + 1
    },
    circle: {
        radius: 10,
            stroke: {
            color: blue
        },
        fill: {
            color: lightblue
        }
    }
}];

/** Default symbol for buffer */
const buffer = [{

    fill: {
        color: [255, 255, 255, 0.7]
    },
    stroke: {
        color: [0, 0, 0, 0.7],
        width: 3

    }
}];


export {
    choose,
    buffer
}